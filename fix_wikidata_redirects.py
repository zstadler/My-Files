#!/usr/bin/env python3

"""
This script identifies and prepares fixes for redirected Wikidata tags in OpenStreetMap.

It follows the 9-step process outlined by the user:
1.  Uses Overpass to find all elements in a specific area with a 'wikidata' tag.
2.  For each unique wikidata ID (QID), fetches its entity data from Wikidata's MediaWiki API.
3.  Compares the requested QID with the 'id' field in the response to find redirects.
4.  Keeps a map of all OSM elements that need to be updated.
5.  Generates a new Overpass query to fetch *only* the elements that need fixing,
    using 'out meta geom' to get their full data.
6.  Submits this second query as a POST request and captures the XML.
7.  Parses the XML and replaces the old wikidata QID with the new, correct QID.
8.  Adds an 'action="modify"' attribute to each modified OSM element.
9.  Prints the final, updated XML to standard output.

This output file is suitable for loading into an OSM editor like JOSM for review
and upload.

Usage:
  fix_wikidata_redirects.py <area_id>

Options:
  -h --help     Show this screen.
  --version     Show version.
"""

import requests
import sys
import time
import xml.etree.ElementTree as ET
from docopt import docopt
from typing import Dict, Set, List, Tuple, Any

# --- Configuration ---

# Overpass API endpoint
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Wikidata API endpoint (using the stable MediaWiki API for batch fetching)
WIKIDATA_API_BASE_URL = "https://www.wikidata.org/w/api.php"

# User-Agent for API requests - using the specific URL provided
USER_AGENT = "fix_wikidata_redirects.py (https://github.com/zstadler/My-Files/fix_wikidata_redirects.py)"
# ---

# How many QIDs to query at once from the Wikidata API
WIKIDATA_BATCH_SIZE = 50

# Retry configuration for API requests
MAX_RETRIES = 5
INITIAL_BACKOFF = 2  # seconds

# --- Helper Functions ---

def log(message: str):
    """Prints a message to standard error."""
    print(f"[INFO] {message}", file=sys.stderr)

def log_error(message: str):
    """Prints an error message to standard error."""
    print(f"[ERROR] {message}", file=sys.stderr)

def request_with_retry(
    method: str,
    url: str,
    **kwargs
) -> requests.Response:
    """
    Performs an HTTP request with exponential backoff.
    """
    headers = kwargs.get("headers", {})
    headers.setdefault("User-Agent", USER_AGENT)
    kwargs["headers"] = headers
    
    retries = 0
    backoff = INITIAL_BACKOFF
    
    while retries < MAX_RETRIES:
        try:
            if method.upper() == "POST":
                response = requests.post(url, **kwargs)
            else:
                response = requests.get(url, **kwargs)
            
            # 429 Too Many Requests or 5xx Server Errors are worth retrying
            if response.status_code == 429 or response.status_code >= 500:
                response.raise_for_status()
            
            # Any other bad status code, we just fail
            if not response.ok:
                log_error(f"Request failed with status {response.status_code}: {response.text}")
                response.raise_for_status()

            return response

        except requests.exceptions.RequestException as e:
            retries += 1
            if retries >= MAX_RETRIES:
                log_error(f"Final attempt failed for {method.upper()} {url}.")
                raise e
            
            log(f"Request failed ({e}), retrying in {backoff}s... ({retries}/{MAX_RETRIES})")
            time.sleep(backoff)
            backoff *= 2  # Exponential backoff

    # This line should not be reachable, but raises an exception if it is
    raise requests.exceptions.RequestException(f"Failed to fetch {url} after {MAX_RETRIES} retries.")


def overpass_query(query: str, response_format: str = 'json') -> Any:
    """
    Submits a query to the Overpass API via POST and returns the response.
    Uses request_with_retry for robustness.
    """
    log(f"Submitting Overpass query (format: {response_format})...")
    try:
        response = request_with_retry(
            "POST",
            OVERPASS_URL,
            data={'data': query},
            timeout=300  # 5-minute timeout for the Python request
        )
        
        log("Query successful.")
        if response_format == 'json':
            return response.json()
        elif response_format == 'xml':
            return response.text
        return response.text

    except requests.exceptions.RequestException as e:
        log_error(f"Overpass API request failed: {e}")
        log_error(f"Query was: {query}")
        return None

def fetch_wikidata_entities(qids: Set[str]) -> Dict[str, str]:
    """
    Fetches entity data from Wikidata in batches using the MediaWiki API.
    Returns a dictionary mapping old QIDs to new QIDs for redirects.
    Uses request_with_retry for robustness.
    """
    log(f"Fetching {len(qids)} unique QIDs from Wikidata in batches of {WIKIDATA_BATCH_SIZE}...")
    redirect_map: Dict[str, str] = {}
    qids_list = list(qids)

    for i in range(0, len(qids_list), WIKIDATA_BATCH_SIZE):
        batch = qids_list[i:i + WIKIDATA_BATCH_SIZE]
        ids_param = "|".join(batch)
        
        # Use MediaWiki API with parameters for reliable batch fetching
        params = {
            "action": "wbgetentities",
            "ids": ids_param,
            "format": "json",
            "redirects": "yes"
        }
        
        log(f"  Fetching batch {i // WIKIDATA_BATCH_SIZE + 1} / {len(qids_list) // WIKIDATA_BATCH_SIZE + 1}...")
        
        try:
            # Use the base URL and pass parameters separately
            response = request_with_retry(
                "GET",
                WIKIDATA_API_BASE_URL,
                params=params,
                timeout=60
            )
            data = response.json()
            
            # Step 3: Check for redirects
            for requested_qid, entity_data in data.get("entities", {}).items():
                # The wbgetentities response structure is slightly different but still contains 'id'
                actual_qid = entity_data.get("id")
                
                # Check if 'id' exists and is different from the requested QID
                if actual_qid and requested_qid != actual_qid:
                    log(f"    Redirect found: {requested_qid} -> {actual_qid}")
                    redirect_map[requested_qid] = actual_qid

        except requests.exceptions.RequestException as e:
            log_error(f"Wikidata API request failed for batch: {e}")
            # Continue to next batch
        
        # Be polite to the API
        time.sleep(1)
        
    log(f"Found {len(redirect_map)} total redirects.")
    return redirect_map

# --- Main Script ---

def main(area_id: str):
    # Step 1: Find all OSM elements in the area with a wikidata tag
    log(f"Step 1: Finding all elements with 'wikidata' tag in area {area_id}...")
    
    # Optimization: Use [out:tags] instead of [out:body]
    # We only need the type, id, and tags, not geometry or member lists
    # for this first query.
    query_1 = f"""
    [out:json][timeout:180];
    area({area_id})->.searchArea;
    (
      nwr[wikidata](area.searchArea);
    );
    out tags;
    """
    
    osm_data = overpass_query(query_1, response_format='json')
    if not osm_data:
        log_error("Failed to fetch initial OSM data. Exiting.")
        sys.exit(1)

    element_count = len(osm_data.get("elements", []))
    log(f"Found {element_count} OSM elements to be processed in this area.")

    # Step 2: Collate all unique wikidata QIDs
    log("Step 2: Collating all unique QIDs...")
    all_qids: Set[str] = set()
    # This map stores: { "Q123": [("node", 12345), ("way", 67890)], ... }
    elements_by_qid: Dict[str, List[Tuple[str, int]]] = {}

    for el in osm_data.get("elements", []):
        tags = el.get("tags", {})
        qid = tags.get("wikidata")
        
        if qid and qid.startswith("Q"):
            osm_type = el["type"]
            osm_id = el["id"]
            all_qids.add(qid)
            
            if qid not in elements_by_qid:
                elements_by_qid[qid] = []
            elements_by_qid[qid].append((osm_type, osm_id))

    if not all_qids:
        log("No elements with wikidata tags found. Exiting.")
        sys.exit(0)

    # Step 3: Fetch QIDs from Wikidata and find redirects
    # redirect_map contains: { "old_QID": "new_QID", ... }
    redirect_map = fetch_wikidata_entities(all_qids)
    if not redirect_map:
        log("No wikidata redirects found. Nothing to do. Exiting.")
        sys.exit(0)

    # Step 4: Map redirects back to OSM elements
    log("Step 4: Identifying all OSM elements that need fixing...")
    # elements_to_fix will hold sets of IDs, grouped by type
    elements_to_fix: Dict[str, Set[str]] = {"node": set(), "way": set(), "relation": set()}
    # fix_details_map stores the (old_QID, new_QID) tuple
    fix_details_map: Dict[Tuple[str, int], Tuple[str, str]] = {}
    
    for old_qid, new_qid in redirect_map.items():
        if old_qid in elements_by_qid:
            for osm_type, osm_id in elements_by_qid[old_qid]:
                elements_to_fix[osm_type].add(str(osm_id))
                # Store both the old and new QID
                fix_details_map[(osm_type, osm_id)] = (old_qid, new_qid) 

    log(f"Found {len(fix_details_map)} total OSM elements to modify.")

    # Step 5: Create an Overpass query to fetch all such elements
    log("Step 5: Generating second Overpass query...")
    query_parts = []
    if elements_to_fix["node"]:
        query_parts.append(f"node(id:{','.join(elements_to_fix['node'])});")
    if elements_to_fix["way"]:
        query_parts.append(f"way(id:{','.join(elements_to_fix['way'])});")
    if elements_to_fix["relation"]:
        query_parts.append(f"relation(id:{','.join(elements_to_fix['relation'])});")
    
    if not query_parts:
        log_error("Internal error: Had redirects but no elements to query. Exiting.")
        sys.exit(1)

    # [out:meta geom] is correct: 'meta' provides version info for editing,
    # 'geom' provides node coordinates for ways.
    query_2 = f"""
    [out:xml][timeout:360];
    (
      {''.join(query_parts)}
    );
    out meta geom;
    """

    # Step 6: Submit the query and capture the XML result
    log("Step 6: Submitting second query to fetch full XML data...")
    xml_data = overpass_query(query_2, response_format='xml')
    if not xml_data:
        log_error("Failed to fetch final XML data. Exiting.")
        sys.exit(1)

    # Step 7, 8: Replace values and add action="modify"
    log("Steps 7 & 8: Parsing XML and applying modifications and comments...")
    
    modified_count = 0 
    
    try:
        # We must register the namespace to avoid "ns0:" prefixes in the output
        ET.register_namespace("", "http://openstreetmap.org/osm/v0.6")
        
        root = ET.fromstring(xml_data)
        
        # We need a copy of the list of children for reliable iteration/modification
        elements_to_process = root.findall('node') + root.findall('way') + root.findall('relation')
        
        for element in elements_to_process:
            osm_type = element.tag
            osm_id = int(element.get('id'))
            key = (osm_type, osm_id)
            
            if key in fix_details_map:
                old_qid, new_qid = fix_details_map[key]
                
                osm_link = f"https://www.openstreetmap.org/{osm_type}/{osm_id}"
                old_wikidata_link = f"https://www.wikidata.org/wiki/{old_qid}"
                
                comment_text_1 = f"Fixing wikidata redirect for {osm_type}/{osm_id}: {osm_link}"
                comment_text_2 = f"Old ID {old_qid} redirected to {new_qid}. Old item link: {old_wikidata_link}"

                comment_1 = ET.Comment(comment_text_1)
                comment_2 = ET.Comment(comment_text_2)
                
                # ADDED: Set tail to insert a newline after each comment for better raw XML readability
                comment_1.tail = "\n  "
                comment_2.tail = "\n  "

                # Find the index of the element to insert comments before it
                root_children = list(root)
                try:
                    index = root_children.index(element)
                    # Insert comment 2 first (it will be placed right before the element)
                    root.insert(index, comment_2)
                    # Insert comment 1 second (it will be placed before comment 2)
                    root.insert(index, comment_1)
                except ValueError:
                    # Should not happen, but safe to ignore if the element is not found
                    pass

                # Step 8: Add action="modify"
                element.set("action", "modify")
                
                # Step 7: Replace wikidata value
                found_tag = False
                for tag in element.findall('tag'):
                    if tag.get('k') == 'wikidata':
                        tag.set('v', new_qid)
                        found_tag = True
                        break
                
                # This is a fallback in case the tag was somehow deleted
                # between our first and second query.
                if not found_tag:
                    log(f"  Warning: Element {osm_type}/{osm_id} had wikidata tag in query 1 but not in query 2. Adding it back.")
                    ET.SubElement(element, 'tag', {'k': 'wikidata', 'v': new_qid})
                
                modified_count += 1
            
            else:
                # This element was in the query 2 result but not in our
                # map. This is expected: it's a child node of a way or
                # a member of a relation fetched by 'out geom'.
                # We remove it from the output file so we only upload
                # changes for the parent elements.
                root.remove(element)

        log(f"Successfully modified {modified_count} elements in the XML tree.")

        # Step 9: Print the updated XML to the standard output
        # We use 'unicode' encoding to get a string, not bytes
        final_xml = ET.tostring(root, encoding='unicode', short_empty_elements=True)
        print(final_xml)

    except ET.ParseError as e:
        log_error(f"Failed to parse Overpass XML response: {e}")
        sys.exit(1)

if __name__ == "__main__":
    arguments = docopt(__doc__, version='fix_wikidata_redirects 1.0')
    
    # docopt uses the key name <area_id> from the Usage string
    main(area_id=arguments['<area_id>'])

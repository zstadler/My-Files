// ==UserScript==
// @name        cintlv.presglobal.store - Event to Calendar (Style Watch)
// @namespace   http://tampermonkey.net/
// @version     2.1
// @description Adds "Add to Calendar" links (Google Calendar & ICS) to event popups on cintlv.presglobal.store, based on dialog visibility.
// @author      AI Assistant
// @match       https://cintlv.presglobal.store/customer*
// @grant       none
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT_EVENT_DURATION_HOURS = 2; // Event duration is 2 hours

    // --- Helper Functions for Date/Time & Calendar Link Generation ---

    /**
     * Parses date and time strings from the popup content into Date objects.
     * Expected dateStr: "09/07/2025" (after stripping "יום רביעי, ")
     * Expected timeStr: "20:30"
     * @param {string} dateStr - The date part of the string (DD/MM/YYYY).
     * @param {string} timeStr - The time part of the string (HH:MM).
     * @returns {{start: Date, end: Date}|null} Object containing start and end Date objects, or null if parsing fails.
     */
    function parseDateTime(dateStr, timeStr) {
        const dateParts = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        const timeParts = timeStr.match(/(\d{2}):(\d{2})/);

        if (!dateParts || dateParts.length < 4 || !timeParts || timeParts.length < 3) {
            console.error('Calendar Script: Could not parse date or time:', dateStr, timeStr);
            return null;
        }

        const day = parseInt(dateParts[1], 10);
        const month = parseInt(dateParts[2], 10) - 1; // Month is 0-indexed in JS Date
        const year = parseInt(dateParts[3], 10);
        const hour = parseInt(timeParts[1], 10);
        const minute = parseInt(timeParts[2], 10);

        const startDate = new Date(year, month, day, hour, minute);
        const endDate = new Date(startDate.getTime() + (DEFAULT_EVENT_DURATION_HOURS * 60 * 60 * 1000));

        return { start: startDate, end: endDate };
    }

    /**
     * Formats a Date object into YYYYMMDDTHHMMSS format for ICS and Google Calendar URLs.
     * @param {Date} date - The Date object to format.
     * @returns {string} Formatted date-time string.
     */
    function formatDateTimeForCalendar(date) {
        const pad = (num) => num < 10 ? '0' + num : '' + num;
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());
        return `${year}${month}${day}T${hours}${minutes}${seconds}`;
    }

    /**
     * Creates an ICS (iCalendar) data URI link for downloading.
     * @param {string} title - Event title.
     * @param {{start: Date, end: Date}} datetimeObj - Object with start and end Date objects.
     * @param {string} location - Event location string.
     * @returns {string|null} ICS data URI string, or null.
     */
    function createICSLink(title, datetimeObj, location) {
        if (!datetimeObj) return null;

        const startDateICS = formatDateTimeForCalendar(datetimeObj.start);
        const endDateICS = formatDateTimeForCalendar(datetimeObj.end);

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Event To Calendar Script//NONSGML v1.0//EN',
            'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT',
            `DTSTART:${startDateICS}`,
            `DTEND:${endDateICS}`,
            `SUMMARY:${title}`,
            `LOCATION:${location || ''}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\n');

        return `data:text/calendar;charset=utf8,${encodeURIComponent(icsContent)}`;
    }

    /**
     * Creates a Google Calendar direct import URL.
     * @param {string} title - Event title.
     * @param {{start: Date, end: Date}} datetimeObj - Object with start and end Date objects.
     * @param {string} location - Event location string.
     * @returns {string|null} Google Calendar URL, or null.
     */
    function createGoogleCalendarLink(title, datetimeObj, location) {
        if (!datetimeObj) return null;

        const googleStartDate = formatDateTimeForCalendar(datetimeObj.start);
        const googleEndDate = formatDateTimeForCalendar(datetimeObj.end);

        const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
        const params = new URLSearchParams();
        params.append('text', title);
        params.append('dates', `${googleStartDate}/${googleEndDate}`);
        if (location) {
            params.append('location', location);
        }

        return `${baseUrl}&${params.toString()}`;
    }

    // --- DOM Identification Helpers ---

    /**
     * Finds the actual event detail card (div with data-v- attribute and v-card classes)
     * within the `ticket-dialog` element.
     * @param {HTMLElement} ticketDialogElement - The `div.v-dialog.ticket-dialog.customer-area-dialog` element.
     * @returns {HTMLElement|null} The event card element, or null if not found.
     */
    function getEventCardFromTicketDialog(ticketDialogElement) {
        // The specific card containing event details is a child of the ticket dialog
        return ticketDialogElement.querySelector('div[data-v-7f02a4b2][class*="card v-card"]');
    }

    /**
     * Checks if a given event card element contains the expected content for an event.
     * @param {HTMLElement|null} eventCardElement - The potential event card element.
     * @returns {boolean} True if it's a valid event card, false otherwise.
     */
    function isEventCardValid(eventCardElement) {
        return eventCardElement &&
               eventCardElement.querySelector('.v-card__title.headline') &&
               eventCardElement.querySelector('.info-subtitle.datetime-presentation');
    }

    /**
     * Checks if a `ticket-dialog` element is currently visible (i.e., display: none is NOT set).
     * @param {HTMLElement} ticketDialogElement
     * @returns {boolean}
     */
    function isTicketDialogVisible(ticketDialogElement) {
        return ticketDialogElement.style.display !== 'none';
    }

    // --- Main Processing Logic ---

    /**
     * Processes a valid event card element to add calendar links.
     * @param {HTMLElement} eventCardElement - The div.card element containing event details.
     */
    function processEventPopup(eventCardElement) {
        // Remove any existing calendar links to prevent duplicate processing
        const existingLinksWrapper = eventCardElement.querySelector('#greasemonkey-calendar-links-wrapper');
        if (existingLinksWrapper) {
            existingLinksWrapper.remove();
        }

        const titleElement = eventCardElement.querySelector('.v-card__title.headline');
        const eventDateElement = eventCardElement.querySelector('.info-subtitle.datetime-presentation');
        const locationElement = eventCardElement.querySelector('.info-title.location');
        const venueElement = eventCardElement.querySelector('.info-subtitle.venue');

        if (!titleElement || !eventDateElement) {
            console.warn('Calendar Script: Missing title or event date element in event card. Cannot process.');
            return;
        }

        const title = titleElement.textContent.trim();
        const rawDateTime = eventDateElement.textContent.trim();

        // Regex to extract DD/MM/YYYY and HH:MM, allowing for optional leading day-of-week text
        const dateTimeMatch = rawDateTime.match(/(?:יום \S+, )?(\d{2}\/\d{2}\/\d{4}) בשעה (\d{2}:\d{2})/);
        if (!dateTimeMatch || dateTimeMatch.length < 3) {
            console.error('Calendar Script: Could not extract date and time from raw string:', rawDateTime);
            return;
        }
        const datePart = dateTimeMatch[1].trim();
        const timePart = dateTimeMatch[2].trim();

        const datetimeObj = parseDateTime(datePart, timePart);
        if (!datetimeObj) return;

        let locationText = '';
        if (locationElement && venueElement) {
            locationText = `${locationElement.textContent.trim()}, ${venueElement.textContent.trim()}`;
        } else if (locationElement) {
            locationText = locationElement.textContent.trim();
        }

        const icsLink = createICSLink(title, datetimeObj, locationText);
        const googleCalendarLink = createGoogleCalendarLink(title, datetimeObj, locationText);

        if (icsLink && googleCalendarLink) {
            const edocBtnContainer = eventCardElement.querySelector('.edoc-btn');
            if (edocBtnContainer) {
                const linkWrapper = document.createElement('div');
                linkWrapper.id = 'greasemonkey-calendar-links-wrapper';
                linkWrapper.style.marginTop = '24px';
                linkWrapper.style.textAlign = 'center';
                linkWrapper.style.display = 'flex';
                linkWrapper.style.flexDirection = 'column';
                linkWrapper.style.gap = '8px'; // Space between buttons

                // Helper to create styled link buttons
                const createLinkButton = (href, text, id, backgroundColor, target = '_self') => {
                    const anchor = document.createElement('a');
                    anchor.href = href;
                    anchor.textContent = text;
                    anchor.id = id;
                    anchor.target = target;
                    anchor.style.display = 'block';
                    anchor.style.width = 'fit-content';
                    anchor.style.margin = '0 auto';
                    anchor.style.padding = '10px 20px';
                    anchor.style.backgroundColor = backgroundColor;
                    anchor.style.color = 'white';
                    anchor.style.textDecoration = 'none';
                    anchor.style.borderRadius = '5px';
                    anchor.style.fontWeight = 'bold';
                    anchor.style.fontSize = '15px';
                    anchor.style.cursor = 'pointer';
                    anchor.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
                    anchor.style.transition = 'background-color 0.2s ease';
                    anchor.onmouseover = function() {
                        const rgb = backgroundColor.match(/\d+/g).map(Number);
                        this.style.backgroundColor = `rgb(${Math.max(0, rgb[0] - 20)}, ${Math.max(0, rgb[1] - 20)}, ${Math.max(0, rgb[2] - 20)})`;
                    };
                    anchor.onmouseout = function() { this.style.backgroundColor = backgroundColor; };
                    return anchor;
                };

                // Google Calendar Link Button
                const googleLink = createLinkButton(
                    googleCalendarLink,
                    'הוסף ליומן (גוגל)',
                    'greasemonkey-google-calendar-link',
                    'rgb(66, 133, 244)', // Google Blue
                    '_blank' // Open in new tab
                );

                // ICS Link Button
                const icsAnchor = createLinkButton(
                    icsLink,
                    'הוסף ליומן (ICS)',
                    'greasemonkey-ics-calendar-link',
                    'rgb(76, 175, 80)' // Green
                );
                icsAnchor.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_event.ics`; // Suggested filename

                linkWrapper.appendChild(googleLink);
                linkWrapper.appendChild(icsAnchor);

                // Insert the new links below the 'כרטיס אלקטרוני' button
                edocBtnContainer.parentNode.insertBefore(linkWrapper, edocBtnContainer.nextSibling);
                console.log('Calendar Script: Calendar links successfully added to an event popup.');
            } else {
                console.warn('Calendar Script: Could not find .edoc-btn within the event card to insert calendar links.');
            }
        }
    }

    // --- Mutation Observers for Dynamic Content based on new mechanism ---

    /**
     * This observer watches `v-dialog__content` elements specifically for changes to their
     * child `div.v-dialog.ticket-dialog.customer-area-dialog`'s `style` attribute.
     * It triggers processing when `display: none` is removed, indicating the dialog is shown.
     */
    const dialogVisibilityObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const ticketDialogElement = mutation.target;
                if (ticketDialogElement.classList.contains('v-dialog') && ticketDialogElement.classList.contains('ticket-dialog')) {
                    if (isTicketDialogVisible(ticketDialogElement)) {
                        // The ticket dialog is now visible.
                        // Give a tiny moment for content to fully render, then process.
                        setTimeout(() => {
                            const eventCard = getEventCardFromTicketDialog(ticketDialogElement);
                            if (isEventCardValid(eventCard)) {
                                console.log('Calendar Script: Detected ticket dialog visibility change (display: none removed), processing...');
                                processEventPopup(eventCard);
                            } else {
                                console.log('Calendar Script: Ticket dialog visible but inner event card not yet valid or found.');
                            }
                        }, 50); // Small delay (50ms) to ensure content is fully loaded
                    }
                    // Optionally, if you wanted to remove the links when the popup hides, you'd add an else here.
                }
            }
        });
    });

    /**
     * This observer watches the document body for `childList` mutations (elements being added/removed).
     * Its role is to find newly added `.v-dialog__content` elements and then attach the
     * `dialogVisibilityObserver` to their `.ticket-dialog` child.
     */
    const bodyObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Ensure it's an element
                        let dialogContents = [];
                        // Check if the added node itself is a v-dialog__content
                        if (node.classList.contains('v-dialog__content')) {
                            dialogContents.push(node);
                        }
                        // Also look for v-dialog__content elements within newly added parent nodes (subtree)
                        if (node.querySelector) {
                            dialogContents = dialogContents.concat(Array.from(node.querySelectorAll('.v-dialog__content')));
                        }

                        dialogContents.forEach(dialogContentNode => {
                            const ticketDialog = dialogContentNode.querySelector('.v-dialog.ticket-dialog.customer-area-dialog');
                            if (ticketDialog) {
                                // Important: Start observing the 'style' attribute of this ticketDialog for visibility changes
                                dialogVisibilityObserver.observe(ticketDialog, { attributes: true, attributeFilter: ['style'], subtree: false });

                                // If it's already visible on addition, process it immediately
                                if (isTicketDialogVisible(ticketDialog)) {
                                    const eventCard = getEventCardFromTicketDialog(ticketDialog);
                                    if (isEventCardValid(eventCard)) {
                                        console.log('Calendar Script: BodyObserver found active ticket dialog on node addition, processing...');
                                        processEventPopup(eventCard);
                                    }
                                }
                            }
                        });
                    }
                });
            }
        });
    });

    // --- Initial Setup and Observation Start ---

    // 1. On script load, find all existing `.v-dialog__content` elements in the DOM.
    // This covers cases where the dialog structure might already exist but is hidden.
    document.querySelectorAll('.v-dialog__content').forEach(dialogContentNode => {
        const ticketDialog = dialogContentNode.querySelector('.v-dialog.ticket-dialog.customer-area-dialog');
        if (ticketDialog) {
            // Start observing the 'style' attribute of this existing ticketDialog for visibility changes.
            dialogVisibilityObserver.observe(ticketDialog, { attributes: true, attributeFilter: ['style'], subtree: false });

            // If it's currently visible on load, process it immediately.
            if (isTicketDialogVisible(ticketDialog)) {
                const eventCard = getEventCardFromTicketDialog(ticketDialog);
                if (isEventCardValid(eventCard)) {
                    console.log('Calendar Script: Initial scan found visible ticket dialog, processing...');
                    processEventPopup(eventCard);
                }
            }
        }
    });

    // 2. Start the `bodyObserver` to catch any *new* `.v-dialog__content` elements
    // that might be added to the DOM after the initial page load.
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    console.log('Calendar Script: Initialized and observing for popups via ticket-dialog visibility.');

})();

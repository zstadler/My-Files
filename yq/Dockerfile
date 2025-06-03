FROM ghcr.io/jqlang/jq:latest AS jq
FROM python:alpine

COPY --from=jq /jq /usr/bin

RUN set -eux ;\
   /bin/sh -c 'echo ""; echo ""; echo "##### Installing Python packages in Virtual Environment..."' >&2 ;\
    python3 -m venv /venv ;\
    . /venv/bin/activate ;\
    /venv/bin/pip install --no-cache-dir yq

ENV PATH=/venv/bin:${PATH}

RUN umask 0; mkdir /w

WORKDIR /w

ENTRYPOINT ["/usr/bin/env"]

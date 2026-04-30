FROM gcc:13.2.0-bookworm

RUN useradd -m -u 1000 runner
USER runner

WORKDIR /workspace

FROM gcc:13

WORKDIR /app

# create non-root user for safety
RUN useradd -m coder

USER coder

CMD ["bash"]


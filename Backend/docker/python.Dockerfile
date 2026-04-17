FROM python:3.12-alpine

WORKDIR /app

RUN adduser -D coder

USER coder

CMD ["python3"]
FROM ubuntu:22.04

# install languages
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    nodejs \
    npm \
    g++ \
    build-essential \
    curl

# set working directory
WORKDIR /app

# copy backend files
COPY . .

# install dependencies if exist
RUN pip3 install -r requirements.txt || true
RUN npm install || true

# expose port
EXPOSE 5000

# start server
CMD ["npm","start"]
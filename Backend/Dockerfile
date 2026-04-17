FROM node:18

# install extra compilers
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    g++ \
    build-essential

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 5000

CMD ["npm","start"]

FROM node:18

# install compilers
RUN apt-get update && apt-get install -y \
 python3 \
 python3-pip \
 g++ \
 build-essential \
 bash \
 curl

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

ENV NODE_ENV=production

EXPOSE 10000

CMD ["node","index.js"]

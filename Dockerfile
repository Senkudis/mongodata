FROM node:20-bullseye-slim

# تثبيت git وأدوات البناء الضرورية لتجنب الأخطاء
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# مسح أي ملفات قديمة وتثبيت نظيف
RUN rm -rf node_modules package-lock.json
RUN npm install

COPY . .

CMD ["node", "index.js"]

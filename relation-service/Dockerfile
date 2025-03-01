FROM node:23-alpine

# Install OpenSSL
RUN apk add --no-cache openssl

# Set environment variable to control Node.js SSL/TLS behavior
ENV NODE_OPTIONS="--tls-cipher-list=DEFAULT@SECLEVEL=0"
ENV OPENSSL_CONF=/app/openssl.cnf

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

# Create an OpenSSL configuration file that enables older protocols
RUN echo "[system_default_sect]" > /app/openssl.cnf && \
    echo "MinProtocol = TLSv1" >> /app/openssl.cnf && \
    echo "CipherString = DEFAULT@SECLEVEL=0" >> /app/openssl.cnf

EXPOSE 3002

CMD ["npm", "start"]
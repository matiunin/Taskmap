FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig*.json vite.config.ts ./
COPY src/ ./src/
COPY public/ ./public/
RUN npm run build

FROM php:8.4-apache-bookworm AS runtime
# The official Apache image includes PHP cURL and CA certificates.
RUN php -r 'exit(extension_loaded("curl") ? 0 : 1);' \
    && a2enmod headers rewrite reqtimeout
COPY --from=build /app/dist/ /var/www/html/
COPY server/php/proxy.php /opt/taskmap/proxy.php
COPY deploy/api/ /var/www/html/api/
COPY deploy/apache-taskmap.conf /etc/apache2/conf-available/taskmap.conf
COPY deploy/php-taskmap.ini /usr/local/etc/php/conf.d/taskmap.ini
RUN a2dissite 000-default && a2enconf taskmap
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD php -r '$c=curl_init("http://127.0.0.1/api/health");curl_setopt($c,CURLOPT_RETURNTRANSFER,true);curl_setopt($c,CURLOPT_TIMEOUT,4);$b=curl_exec($c);exit(curl_getinfo($c,CURLINFO_HTTP_CODE)===200&&str_contains((string)$b,"\"OK\"")?0:1);'

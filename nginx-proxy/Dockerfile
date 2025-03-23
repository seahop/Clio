FROM nginx:alpine

# Copy configs and startup script
COPY configs/ /etc/nginx/configs/
COPY start.sh /start.sh

EXPOSE 80
EXPOSE 443

# Use the startup script as entrypoint
CMD ["/start.sh"]
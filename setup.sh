#!/bin/bash

# Update package information
sudo apt-get update

# Install prerequisite packages
sudo apt-get install -y ca-certificates curl gnupg

# Create directory for apt keyrings if it doesn't exist
sudo install -m 0755 -d /etc/apt/keyrings

# Download Docker's GPG key
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Set up Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update package information again with the new repository
sudo apt-get update

# Install Docker and related tools
sudo apt-get install -y git python3 python3-pip python3-venv certbot docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start and enable Docker service
sudo systemctl enable docker
sudo systemctl start docker

# Add current user to docker group
sudo usermod -aG docker $USER

# Inform user about the need to log out and back in
echo "=== Setup Complete ==="
echo "You need to log out and log back in for docker group membership to take effect."
echo "Run 'docker ps' after logging back in to verify your Docker installation."
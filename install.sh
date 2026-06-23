#!/bin/bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}"
echo "  ████████╗██████╗  █████╗  ██████╗██╗  ██╗███╗   ███╗██╗   ██╗"
echo "     ██╔══╝██╔══██╗██╔══██╗██╔════╝██║ ██╔╝████╗ ████║╚██╗ ██╔╝"
echo "     ██║   ██████╔╝███████║██║     █████╔╝ ██╔████╔██║ ╚████╔╝ "
echo "     ██║   ██╔══██╗██╔══██║██║     ██╔═██╗ ██║╚██╔╝██║  ╚██╔╝  "
echo "     ██║   ██║  ██║██║  ██║╚██████╗██║  ██╗██║ ╚═╝ ██║   ██║   "
echo "     ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝  "
echo "  TrackMyTime — Self-hosted time tracker"
echo -e "${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Installing Docker...${NC}"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  echo -e "${GREEN}Docker installed.${NC}"
else
  echo -e "${GREEN}✓ Docker found${NC}"
fi

if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
  echo -e "${YELLOW}Installing Docker Compose plugin...${NC}"
  sudo apt-get install -y docker-compose-plugin
fi

# Create data dir
mkdir -p data

# Build & start
echo -e "${BLUE}Building and starting TrackMyTime...${NC}"
docker compose down 2>/dev/null || true
docker compose up -d --build

# Wait for it
echo -e "${YELLOW}Waiting for server...${NC}"
for i in {1..15}; do
  if curl -s http://localhost:8888/health > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Install systemd service
SERVICE_DIR="$(pwd)"
cat > /tmp/trackmytime.service << SVCEOF
[Unit]
Description=TrackMyTime
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${SERVICE_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
SVCEOF

sudo mv /tmp/trackmytime.service /etc/systemd/system/trackmytime.service
sudo systemctl daemon-reload
sudo systemctl enable trackmytime

# Get NAS IP
NAS_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}✓ TrackMyTime is running!${NC}"
echo ""
echo -e "  Local:    ${BLUE}http://localhost:8888${NC}"
echo -e "  Network:  ${BLUE}http://${NAS_IP}:8888${NC}"
echo ""
echo -e "${YELLOW}Chrome Extension Setup:${NC}"
echo "  1. Open Chrome → chrome://extensions"
echo "  2. Enable Developer mode (top right)"
echo "  3. Click 'Load unpacked'"
echo "  4. Select the /extension folder from this repo"
echo "  5. Click the TMT icon → set server to http://${NAS_IP}:8888"
echo ""
echo -e "${GREEN}Done! Open http://${NAS_IP}:8888 from any device on your network.${NC}"

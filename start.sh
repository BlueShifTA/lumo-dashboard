#!/bin/bash
# Start Lumo Dashboard backend (serves frontend static files too)
PYTHON=/home/nvidia/miniforge3/envs/lerobot/bin/python3
export PYTHONPATH=/home/nvidia/Project/lumo-dashboard/backend
pkill -f "lumo_dashboard.main" 2>/dev/null
sleep 1
cd /home/nvidia/Project/lumo-dashboard/backend
nohup $PYTHON -m uvicorn lumo_dashboard.main:app \
  --host 0.0.0.0 \
  --port 8002 \
  --log-level info \
  > /tmp/lumo-dashboard.log 2>&1 &
echo $! > /tmp/lumo-dashboard.pid
echo "Started PID $(cat /tmp/lumo-dashboard.pid)"

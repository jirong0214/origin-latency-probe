FROM python:3.12-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PROBE_HOST=0.0.0.0 \
    PROBE_PORT=8080 \
    PROBE_PATH=/__origin_latency_probe

WORKDIR /app
COPY probe_server.py /app/probe_server.py

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s%s' % (os.getenv('PROBE_PORT', '8080'), os.getenv('HEALTH_PATH', '/healthz')), timeout=2).read()"

CMD ["python", "/app/probe_server.py"]

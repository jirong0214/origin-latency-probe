# Origin Latency Probe

Standalone application-layer probe for measuring the latency of a real origin request path.

The browser should call this service through the same hostname/CDN/reverse-proxy route as normal business traffic. The endpoint returns no-cache headers and a tiny JSON payload, while the frontend measures total round-trip time with `performance.now()`.

The UI should calculate jitter client-side from successful samples, for example as the absolute difference between the latest two measured round-trip times.

## Build

```bash
docker build -t origin-latency-probe:latest .
```

## Run

```bash
docker run -d \
  --name origin-latency-probe \
  --restart unless-stopped \
  -e PROBE_APP_NAME=p.zshio.de \
  -e PROBE_PATH=/__origin_latency_probe \
  -p 127.0.0.1:12071:12071 \
  origin-latency-probe:latest
```

Or:

```bash
docker compose up -d --build
```

## Reverse Proxy

Caddy example:

```caddyfile
example.com {
	@latency_probe path /__origin_latency_probe
	reverse_proxy @latency_probe 127.0.0.1:12071

	reverse_proxy 127.0.0.1:12071
}
```

cloudflared ingress example:

```yaml
ingress:
  - hostname: example.com
    path: /__origin_latency_probe
    service: http://origin-latency-probe:12071
  - hostname: example.com
    service: http://origin-latency-probe:12071
  - service: http_status:404
```

If Cloudflare has aggressive cache rules such as Cache Everything, add a bypass rule for:

```text
*example.com/__origin_latency_probe*
```

## Environment

- `PROBE_APP_NAME`: name returned in the JSON payload. Default: `origin-latency-probe`
- `PROBE_HOST`: bind host inside the container. Default: `0.0.0.0`
- `PROBE_PORT`: bind port inside the container. Default: `12071`
- `PROBE_PATH`: probe endpoint path. Default: `/__origin_latency_probe`
- `HEALTH_PATH`: health endpoint path. Default: `/healthz`

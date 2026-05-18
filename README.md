# Origin Latency Probe

Standalone application-layer probe for measuring the latency of a real origin request path.

The browser should call this service through the same hostname/CDN/reverse-proxy route as normal business traffic. The endpoint returns no-cache headers and a tiny JSON payload, while the frontend measures total round-trip time with `performance.now()`.

The UI samples the probe every 5 seconds. It keeps a rolling window of 120 successful warm samples and calculates average jitter client-side as the average absolute difference between adjacent latency samples in that window. The first successful request after page load, and any request after a long pause, is treated as a cold/resume sample and is displayed separately from the rolling averages.

## Build

```bash
docker build -t origin-latency-probe:latest .
```

## Run

Pull the published probe image:

```bash
docker pull ghcr.io/jirong0214/origin-latency-probe:latest
```

```bash
docker run -d \
  --name origin-latency-probe \
  --restart unless-stopped \
  -e PROBE_APP_NAME=p.zshio.de \
  -p 127.0.0.1:12071:12071 \
  ghcr.io/jirong0214/origin-latency-probe:latest
```

The UI is published separately:

```bash
docker pull ghcr.io/jirong0214/origin-latency-probe-ui:latest
```

Or run both services with Docker Compose:

```bash
docker compose up -d
```

The compose stack starts two services:

- `origin-latency-probe`: JSON probe endpoint on port `12071`
- `origin-latency-ui`: static latency dashboard on port `12072`

For local development builds, use:

```bash
docker compose up -d --build
```

## Published Images

Images are published to GitHub Container Registry on every push to `master` and every `v*.*.*` tag:

- `ghcr.io/jirong0214/origin-latency-probe:latest`
- `ghcr.io/jirong0214/origin-latency-probe-ui:latest`

Version tags such as `v1.0.0` are also published when matching Git tags are pushed. After the first workflow run, make the packages public in the repository's GitHub Packages settings if anonymous pulls should be allowed.

## Reverse Proxy

Caddy example:

```caddyfile
example.com {
	@latency_probe path /__origin_latency_probe
	reverse_proxy @latency_probe 127.0.0.1:12071

	reverse_proxy 127.0.0.1:12072
}
```

cloudflared ingress example:

```yaml
ingress:
  - hostname: example.com
    service: http://origin-latency-ui:80
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
- `PROBE_PATH`: optional probe endpoint path. Default: `/__origin_latency_probe`
- `HEALTH_PATH`: health endpoint path. Default: `/healthz`

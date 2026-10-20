# Certificates Directory

Corporate root certificates trusted at image build time (see `Dockerfile.bot` /
`Dockerfile.bot.jfrog` — `COPY certificates/` then `update-ca-certificates`).

## Required Certificate Files

- `PwCRoot-1.crt` - PwC Root Certificate 1
- `PwCRoot-3.crt` - PwC Root Certificate 3

Place the `.crt` files here before building. The directory is committed with only
this README so the `COPY certificates/` build step always has a valid source.

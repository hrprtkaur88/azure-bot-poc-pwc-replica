#!/bin/sh
# Run inside the messaging pod. Uses Node (curl is usually absent).
node -e '
const fs = require("fs");
const https = require("https");
const clientId = process.env.AZURE_BOT_CLIENT_ID;
const tenantId = process.env.AZURE_BOT_TENANT_ID;
const tokenFile = process.env.AZURE_FEDERATED_TOKEN_FILE;
if (!clientId || !tenantId || !tokenFile) {
  console.error("Missing AZURE_BOT_CLIENT_ID, AZURE_BOT_TENANT_ID, or AZURE_FEDERATED_TOKEN_FILE");
  process.exit(1);
}
const assertion = fs.readFileSync(tokenFile, "utf8").trim();
const body = new URLSearchParams({
  client_id: clientId,
  client_assertion: assertion,
  client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
  grant_type: "client_credentials",
  scope: "https://api.botframework.com/.default",
}).toString();
const req = https.request(
  {
    hostname: "login.microsoftonline.com",
    path: `/${tenantId}/oauth2/v2.0/token`,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      console.log(data);
      process.exit(res.statusCode >= 200 && res.statusCode < 300 ? 0 : 1);
    });
  },
);
req.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});
req.write(body);
req.end();
'

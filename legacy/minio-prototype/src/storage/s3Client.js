import { Readable } from "node:stream";
import { URL } from "node:url";
import { hmacSha256, sha256Hex } from "../utils/hash.js";

export class S3Client {
  constructor({ endpoint, accessKey, secretKey, region = "us-east-1" }) {
    this.endpoint = new URL(endpoint);
    this.accessKey = accessKey;
    this.secretKey = secretKey;
    this.region = region;
    this.service = "s3";
  }

  async ensureBucket(bucket) {
    const exists = await this.bucketExists(bucket);
    if (!exists) {
      await this.request("PUT", { bucket });
    }
  }

  async listBuckets() {
    const response = await this.request("GET");
    const xml = await response.text();
    return parseListAllMyBucketsResult(xml);
  }

  async bucketExists(bucket) {
    const response = await this.request("HEAD", { bucket, allow404: true });
    return response.status === 200;
  }

  async headObject(bucket, key) {
    const response = await this.request("HEAD", { bucket, key, allow404: true });
    return response.status === 200;
  }

  async putObject(bucket, key, body, contentType = "application/octet-stream") {
    await this.request("PUT", {
      bucket,
      key,
      body,
      headers: {
        "content-type": contentType
      }
    });
  }

  async putObjectWithContext(bucket, key, body, { contentType, metadata = {}, tags = {} } = {}) {
    const headers = {
      ...(contentType ? { "content-type": contentType } : {})
    };

    for (const [metaKey, metaValue] of Object.entries(metadata)) {
      if (metaValue === undefined || metaValue === null) {
        continue;
      }
      headers[`x-amz-meta-${normalizeHeaderKey(metaKey)}`] = String(metaValue);
    }

    const query = {};
    const tagging = buildTaggingQuery(tags);
    if (tagging) {
      headers["x-amz-tagging"] = tagging;
    }

    await this.request("PUT", { bucket, key, body, headers, query });
  }

  async copyObject(bucket, sourceKey, targetKey, { contentType, metadata = {}, tags = {} } = {}) {
    const headers = {
      "x-amz-copy-source": `/${encodeSegment(bucket)}/${sourceKey
        .split("/")
        .map((segment) => encodeSegment(segment))
        .join("/")}`,
      "x-amz-metadata-directive": "REPLACE"
    };

    if (contentType) {
      headers["content-type"] = contentType;
    }

    for (const [metaKey, metaValue] of Object.entries(metadata)) {
      if (metaValue === undefined || metaValue === null) {
        continue;
      }
      headers[`x-amz-meta-${normalizeHeaderKey(metaKey)}`] = String(metaValue);
    }

    const tagging = buildTaggingQuery(tags);
    if (tagging) {
      headers["x-amz-tagging"] = tagging;
    }

    await this.request("PUT", { bucket, key: targetKey, headers });
  }

  async putJson(bucket, key, value) {
    const body = Buffer.from(JSON.stringify(value, null, 2), "utf8");
    await this.putObject(bucket, key, body, "application/json; charset=utf-8");
  }

  async listObjects(bucket, options = {}) {
    const response = await this.request("GET", {
      bucket,
      query: {
        "list-type": "2",
        ...(options.prefix ? { prefix: options.prefix } : {}),
        ...(options.continuationToken
          ? { "continuation-token": options.continuationToken }
          : {})
      }
    });
    const xml = await response.text();
    return parseListBucketResult(xml);
  }

  async headObjectHeaders(bucket, key) {
    const response = await this.request("HEAD", { bucket, key, allow404: true });
    if (response.status === 404) {
      return null;
    }
    return response.headers;
  }

  async getObject(bucket, key) {
    const response = await this.request("GET", { bucket, key, allow404: true });
    if (response.status === 404) {
      return null;
    }
    return response;
  }

  async deleteObject(bucket, key) {
    await this.request("DELETE", { bucket, key, allow404: true });
  }

  async deleteBucket(bucket) {
    await this.request("DELETE", { bucket, allow404: true });
  }

  async getObjectTagging(bucket, key) {
    const response = await this.request("GET", {
      bucket,
      key,
      query: { tagging: "" },
      allow404: true
    });
    if (response.status === 404) {
      return null;
    }
    const xml = await response.text();
    return parseTaggingResult(xml);
  }

  async getJson(bucket, key) {
    const response = await this.getObject(bucket, key);
    if (!response) {
      return null;
    }
    return response.json();
  }

  async request(
    method,
    { bucket = "", key = "", query = {}, body = Buffer.alloc(0), headers = {}, allow404 = false } = {}
  ) {
    const payload = normalizeBody(body);
    const now = new Date();
    const amzDate = toAmzDate(now);
    const shortDate = amzDate.slice(0, 8);
    const pathname = buildPathname(bucket, key);
    const canonicalQuery = buildCanonicalQuery(query);
    const host = this.endpoint.host;
    const payloadHash = sha256Hex(payload);
    const requestHeaders = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...headers
    };

    const canonicalHeaders = Object.entries(requestHeaders)
      .map(([name, value]) => [name.toLowerCase(), String(value).trim()])
      .sort(([a], [b]) => a.localeCompare(b));
    const canonicalHeadersString = canonicalHeaders
      .map(([name, value]) => `${name}:${value}\n`)
      .join("");
    const signedHeaders = canonicalHeaders.map(([name]) => name).join(";");
    const canonicalRequest = [
      method.toUpperCase(),
      pathname,
      canonicalQuery,
      canonicalHeadersString,
      signedHeaders,
      payloadHash
    ].join("\n");

    const credentialScope = `${shortDate}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest)
    ].join("\n");

    const signingKey = deriveSigningKey(this.secretKey, shortDate, this.region, this.service);
    const signature = hmacSha256(signingKey, stringToSign, "hex");
    requestHeaders.authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(", ");

    const url = new URL(pathname, this.endpoint);
    if (canonicalQuery) {
      url.search = canonicalQuery;
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: method === "GET" || method === "HEAD" ? undefined : payload
    });

    if (!response.ok && !(allow404 && response.status === 404)) {
      const details = await response.text();
      throw new Error(`S3 ${method} ${pathname} failed with ${response.status}: ${details}`);
    }

    return response;
  }

  async getNodeStream(bucket, key) {
    const response = await this.getObject(bucket, key);
    if (!response) {
      return null;
    }
    return {
      headers: response.headers,
      stream: Readable.fromWeb(response.body)
    };
  }
}

function normalizeBody(body) {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  return Buffer.alloc(0);
}

function toAmzDate(value) {
  const iso = value.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return iso.slice(0, 15) + "Z";
}

function buildPathname(bucket, key) {
  const bucketPart = bucket ? `/${encodeSegment(bucket)}` : "/";
  if (!key) {
    return bucketPart;
  }
  const objectPath = key
    .split("/")
    .map((segment) => encodeSegment(segment))
    .join("/");
  return `${bucketPart.replace(/\/$/, "")}/${objectPath}`;
}

function encodeSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function buildCanonicalQuery(query) {
  return Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => [encodeQueryComponent(name), encodeQueryComponent(String(value))])
    .sort(([aName, aValue], [bName, bValue]) =>
      aName === bName ? aValue.localeCompare(bValue) : aName.localeCompare(bName)
    )
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

function encodeQueryComponent(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function parseListBucketResult(xml) {
  return {
    keys: [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map((match) => decodeXml(match[1])),
    isTruncated: /<IsTruncated>true<\/IsTruncated>/.test(xml),
    nextContinuationToken: xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/)?.[1] || null
  };
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function parseTaggingResult(xml) {
  const tags = {};
  for (const match of xml.matchAll(/<Tag>\s*<Key>(.*?)<\/Key>\s*<Value>(.*?)<\/Value>\s*<\/Tag>/gs)) {
    tags[decodeXml(match[1])] = decodeXml(match[2]);
  }
  return tags;
}

function parseListAllMyBucketsResult(xml) {
  return [...xml.matchAll(/<Bucket>\s*<Name>(.*?)<\/Name>(?:\s*<CreationDate>(.*?)<\/CreationDate>)?\s*<\/Bucket>/gs)].map(
    (match) => ({
      name: decodeXml(match[1]),
      creationDate: match[2] ? decodeXml(match[2]) : null
    })
  );
}

function normalizeHeaderKey(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function buildTaggingQuery(tags) {
  const entries = Object.entries(tags)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(String(key))}=${encodeURIComponent(String(value))}`);
  return entries.length ? entries.join("&") : "";
}

function deriveSigningKey(secretKey, dateStamp, region, service) {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

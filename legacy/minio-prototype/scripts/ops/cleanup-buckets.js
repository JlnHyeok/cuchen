import { getConfig } from "../../src/config.js";
import { S3Client } from "../../src/storage/s3Client.js";

const config = getConfig();
const keepBuckets = new Set((process.argv.slice(2).length ? process.argv.slice(2) : ["pairs", "pairs-performance"]).map(String));

const s3 = new S3Client({
  endpoint: config.minioEndpoint,
  accessKey: config.minioAccessKey,
  secretKey: config.minioSecretKey,
  region: config.region
});

const buckets = await s3.listBuckets();
const removed = [];
const kept = [];

for (const bucket of buckets || []) {
  if (keepBuckets.has(bucket.name)) {
    kept.push(bucket.name);
    continue;
  }

  await clearBucket(bucket.name);
  await s3.deleteBucket(bucket.name);
  removed.push(bucket.name);
}

console.log(
  JSON.stringify(
    {
      kept,
      removed
    },
    null,
    2
  )
);

async function clearBucket(targetBucket) {
  const keys = [];
  let continuationToken = null;

  while (true) {
    const result = await s3.listObjects(targetBucket, {
      ...(continuationToken ? { continuationToken } : {})
    });
    keys.push(...(result.keys || []));
    if (!result.isTruncated || !result.nextContinuationToken) {
      break;
    }
    continuationToken = result.nextContinuationToken;
  }

  for (const key of keys) {
    await s3.deleteObject(targetBucket, key);
  }
}

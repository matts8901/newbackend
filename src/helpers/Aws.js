const AWS = require("aws-sdk");
const { BUCKET_REGION, AWS_ACCESS_KEY, AWS_SECRET_KEY } = require("../config");

// Configure AWS SDK
AWS.config.update({
  region: BUCKET_REGION,
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_KEY,
});
exports.invalidateCloudFront = async (distributionId, paths) => {
  try {
    const cloudfront = new AWS.CloudFront();

    await cloudfront
      .createInvalidation({
        DistributionId: distributionId, // Replace with your CloudFront distribution ID
        InvalidationBatch: {
          Paths: {
            Quantity: 1,
            Items: [
              `/projects/*`, // Invalidate everything under this path
            ],
          },
          CallerReference: `${Date.now()}`, // Use a unique identifier for the invalidation
        },
      })
      .promise();

    return true;
  } catch (error) {
    console.error("CloudFront invalidation failed:", error);
    throw error;
  }
};
exports.s3 = new AWS.S3();

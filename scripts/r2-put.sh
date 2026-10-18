# put <file> <key> [aws s3 cp options…]: upload a file to the R2 bucket, then check the bucket holds all of it (as in
# Sastra PDF's release job). Sourced by .github/workflows/release.yml; needs R2_BUCKET, R2_ENDPOINT and the AWS_* key.
put() {
  local f="$1" key="$2"; shift 2
  aws s3 cp "$f" "s3://$R2_BUCKET/$key" --endpoint-url "$R2_ENDPOINT" --only-show-errors "$@"
  local want got
  want="$(stat -c %s "$f")"
  got="$(aws s3api head-object --bucket "$R2_BUCKET" --key "$key" --endpoint-url "$R2_ENDPOINT" --query ContentLength --output text | tr -d '\r')"
  if [ "$got" != "$want" ]; then echo "::error::$key in R2 is $got bytes, not $want"; exit 1; fi
  echo "Uploaded $key ($got bytes)"
}

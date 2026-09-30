# Sourced by backup.sh and restore-drill.sh: `remote ARGS...` runs rclone in a
# container against the S3-compatible bucket named "spaces", with $work
# mounted at /work. Credentials reach rclone through the environment, never
# argv, so they stay out of `ps` and shell history.
# shellcheck shell=bash

export RCLONE_CONFIG_SPACES_TYPE=s3
export RCLONE_CONFIG_SPACES_PROVIDER=${SPACES_PROVIDER:-DigitalOcean}
export RCLONE_CONFIG_SPACES_ENDPOINT=$SPACES_ENDPOINT
export RCLONE_CONFIG_SPACES_ACCESS_KEY_ID=$SPACES_KEY
export RCLONE_CONFIG_SPACES_SECRET_ACCESS_KEY=$SPACES_SECRET
export RCLONE_CONFIG_SPACES_ACL=private

# shellcheck disable=SC2154 # the sourcing script sets $work
remote() {
  docker run --rm --network host --user "$(id -u):$(id -g)" -e HOME=/tmp \
    -e RCLONE_CONFIG_SPACES_TYPE -e RCLONE_CONFIG_SPACES_PROVIDER \
    -e RCLONE_CONFIG_SPACES_ENDPOINT -e RCLONE_CONFIG_SPACES_ACCESS_KEY_ID \
    -e RCLONE_CONFIG_SPACES_SECRET_ACCESS_KEY -e RCLONE_CONFIG_SPACES_ACL \
    -v "$work:/work" "${BACKUP_RCLONE_IMAGE:-rclone/rclone:1.68}" "$@"
}

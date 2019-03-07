#!/bin/bash

POSITIONAL=()
while [[ $# -gt 0 ]]
  do
  key="$1"

  case $key in
      -t|--tag) # Length of the genome to be simulated
      TAG="$2"
      shift # past argument
      shift # past value
      ;;
      -b|--branch) # Run with spiked peaks, i.e., punctuated increase of binding prob
      BRANCH="$2"
      shift # past argument
      shift # past value
      ;;
      -n|--name)
      NAME="$2"
      shift # past argument
      shift # past value
      ;;
      -d|--description)
      DESCRIPTION="$2"
      shift # past argument
      shift # past value
      ;;
      -a|--auth-token)
      AUTH_TOKEN="$2"
      shift # past argument
      shift # past value
      ;;
  esac
done
set -- "${POSITIONAL[@]}" # restore positional parameters

if [ -z ${TAG+x} ]; then
  echo "Please provide a tag name with -t";
  exit 2
fi

if [ -z ${BRANCH+x} ]; then
  echo "Please provide the branch to be tagged -b";
  exit 2
fi

if [[ $BRANCH == "master" ]]; then
  echo "Pre-releases on master are not allowed!";
  exit 2
fi

if [[ $BRANCH == "develop" ]]; then
  echo "Pre-releases on develop are not allowed!";
  exit 2
fi

if [ -z ${NAME+x} ]; then
  echo "Please provide a pre-release name -n";
  exit 2
fi

if [ -z ${DESCRIPTION+x} ]; then
  echo "Please provide a description with -d";
  exit 2
fi

if [ -z ${AUTH_TOKEN+x} ]; then
  echo "Please provide an auth toke with -a";
  exit 2
fi

echo "Build dist.zip..."

# npm run compile

echo "Create pre-release..."

# Create pre-release
response=$(curl \
  --request POST \
  --header "Content-Type: application/json" \
  --header "Authorization: token $AUTH_TOKEN" \
  --data "{\"tag_name\":\"$TAG\", \"target_commitish\":\"$BRANCH\", \"name\":\"$NAME\", \"body\":\"$DESCRIPTION\", \"draft\":true, \"prerelease\":true}" \
  "https://api.github.com/repos/higlass/higlass/releases")

# Get ID of the asset based on given filename.
eval $(echo "$response" | grep -m 1 "id.:" | grep -w id | tr : = | tr -cd '[[:alnum:]]=')
[ "$id" ] || { echo "Error: Failed to get release id for tag: $tag"; echo "$response" | awk 'length($0)<100' >&2; exit 1; }

# Upload asset
echo "Uploading asset..."

# Construct url
GH_ASSET="https://uploads.github.com/repos/higlass/higlass/releases/$id/assets?name=dist.zip"

curl \
  --data-binary @"./dist.zip" \
  --header "Authorization: token $AUTH_TOKEN" \
  --header "Content-Type: application/octet-stream" \
  $GH_ASSET \




DIR=`dirname "$0"`
for JSON in `ls $DIR/viewconfs`; do
  URL='http://localhost:8080/apis/svg.html?/viewconfs/'$JSON
  echo $URL
done
# /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
#   --headless --disable-gpu --hide-scrollbars \
#   --screenshot=/tmp/default.png \
#   http://localhost:8080/apis/svg.html?/viewconfs/default.json \
#   --virtual-time-budget=2000 \
#   --window-size=500,1000 
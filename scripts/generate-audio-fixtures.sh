#!/usr/bin/env bash
set -euo pipefail

out_dir="${1:-fixtures}"
mkdir -p "$out_dir"

make_fixture() {
  local layout="$1"
  local codec="$2"
  local bitrate="$3"
  local output="$4"
  local expression="$5"
  local mux_flags=()

  if [[ "$output" == *.m4a || "$output" == *.mp4 ]]; then
    mux_flags=(-movflags +faststart)
  fi

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "aevalsrc=${expression}:s=48000:d=3:channel_layout=${layout}" \
    -map 0:a -c:a "$codec" -b:a "$bitrate" "${mux_flags[@]}" \
    "$out_dir/$output"
}

# Each channel uses a different tone. The 659 Hz tone is in the centre channel,
# making it easy to notice when a browser drops the dialogue channel.
make_fixture mono aac 96k aac-mono.m4a \
  '0.25*sin(2*PI*659*t)'
make_fixture stereo aac 160k aac-stereo.m4a \
  '0.25*sin(2*PI*440*t)|0.25*sin(2*PI*554*t)'
make_fixture 5.1 aac 384k aac-5.1.m4a \
  '0.25*sin(2*PI*440*t)|0.25*sin(2*PI*554*t)|0.25*sin(2*PI*659*t)|0.15*sin(2*PI*220*t)|0.25*sin(2*PI*784*t)|0.25*sin(2*PI*880*t)'
make_fixture 7.1 aac 512k aac-7.1.m4a \
  '0.25*sin(2*PI*440*t)|0.25*sin(2*PI*554*t)|0.25*sin(2*PI*659*t)|0.15*sin(2*PI*220*t)|0.25*sin(2*PI*784*t)|0.25*sin(2*PI*880*t)|0.25*sin(2*PI*988*t)|0.25*sin(2*PI*1047*t)'
make_fixture stereo libopus 160k opus-stereo.webm \
  '0.25*sin(2*PI*440*t)|0.25*sin(2*PI*554*t)'
make_fixture 5.1 libopus 384k opus-5.1.webm \
  '0.25*sin(2*PI*440*t)|0.25*sin(2*PI*554*t)|0.25*sin(2*PI*659*t)|0.15*sin(2*PI*220*t)|0.25*sin(2*PI*784*t)|0.25*sin(2*PI*880*t)'
make_fixture stereo libmp3lame 192k mp3-stereo.mp3 \
  '0.25*sin(2*PI*440*t)|0.25*sin(2*PI*554*t)'
make_fixture 5.1 ac3 384k ac3-5.1.mp4 \
  '0.25*sin(2*PI*440*t)|0.25*sin(2*PI*554*t)|0.25*sin(2*PI*659*t)|0.15*sin(2*PI*220*t)|0.25*sin(2*PI*784*t)|0.25*sin(2*PI*880*t)'
make_fixture 5.1 eac3 384k eac3-5.1.mp4 \
  '0.25*sin(2*PI*440*t)|0.25*sin(2*PI*554*t)|0.25*sin(2*PI*659*t)|0.15*sin(2*PI*220*t)|0.25*sin(2*PI*784*t)|0.25*sin(2*PI*880*t)'

printf 'Generated audio fixtures in %s\n' "$out_dir"

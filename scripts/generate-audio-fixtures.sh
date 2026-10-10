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

make_channel_parade_fixture() {
  local layout="$1"
  local bitrate="$2"
  local duration="$3"
  local output="$4"
  shift 4
  local expressions=()
  local index=0
  local start
  local end
  local frequency

  for frequency in "$@"; do
    start=$(awk "BEGIN { printf \"%.2f\", 0.50 + ${index} * 1.00 }")
    end=$(awk "BEGIN { printf \"%.2f\", 1.10 + ${index} * 1.00 }")
    expressions+=("if(between(t\\,${start}\\,${end})\\,0.35*sin(2*PI*${frequency}*t)\\,0)")
    index=$((index + 1))
  done

  local expression
  local separator=''
  expression=''
  for ((index = 0; index < ${#expressions[@]}; index += 1)); do
    expression+="${separator}${expressions[index]}"
    separator='|'
  done

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "aevalsrc=${expression}:s=48000:d=${duration}:channel_layout=${layout}" \
    -map 0:a -c:a aac -profile:a aac_low -b:a "$bitrate" -movflags +faststart \
    "$out_dir/$output"
}

make_multitrack_fixture() {
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i 'aevalsrc=0.35*sin(2*PI*440*t)|0.35*sin(2*PI*440*t):s=48000:d=4:channel_layout=stereo' \
    -f lavfi -i 'aevalsrc=0.35*sin(2*PI*880*t)|0.35*sin(2*PI*880*t):s=48000:d=4:channel_layout=stereo' \
    -map 0:a -map 1:a -c:a aac -profile:a aac_low -b:a 160k -movflags +faststart \
    -metadata:s:a:0 language=eng -metadata:s:a:0 handler_name='Track 1 - 440 Hz' \
    -metadata:s:a:1 language=spa -metadata:s:a:1 handler_name='Track 2 - 880 Hz commentary' \
    -disposition:a:0 default -disposition:a:1 0 \
    "$out_dir/aac-multi-track.m4a"
}

make_fixture stereo aac 160k aac-track-1.m4a \
  '0.35*sin(2*PI*440*t)|0.35*sin(2*PI*440*t)'
make_fixture stereo aac 160k aac-track-2.m4a \
  '0.35*sin(2*PI*880*t)|0.35*sin(2*PI*880*t)'
make_fixture stereo aac 160k aac-channel-fl.m4a \
  '0.35*sin(2*PI*440*t)|0.35*sin(2*PI*440*t)'
make_fixture stereo aac 160k aac-channel-fr.m4a \
  '0.35*sin(2*PI*554*t)|0.35*sin(2*PI*554*t)'
make_fixture stereo aac 160k aac-channel-fc.m4a \
  '0.35*sin(2*PI*659*t)|0.35*sin(2*PI*659*t)'
make_fixture stereo aac 160k aac-channel-lfe.m4a \
  '0.35*sin(2*PI*110*t)|0.35*sin(2*PI*110*t)'
make_fixture stereo aac 160k aac-channel-bl.m4a \
  '0.35*sin(2*PI*784*t)|0.35*sin(2*PI*784*t)'
make_fixture stereo aac 160k aac-channel-br.m4a \
  '0.35*sin(2*PI*880*t)|0.35*sin(2*PI*880*t)'
make_fixture stereo aac 160k aac-channel-sl.m4a \
  '0.35*sin(2*PI*988*t)|0.35*sin(2*PI*988*t)'
make_fixture stereo aac 160k aac-channel-sr.m4a \
  '0.35*sin(2*PI*1047*t)|0.35*sin(2*PI*1047*t)'

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
make_channel_parade_fixture 5.1 384k 6.8 aac-5.1-parade.m4a \
  440 554 659 110 784 880
make_channel_parade_fixture 7.1 512k 8.8 aac-7.1-parade.m4a \
  440 554 659 110 784 880 988 1047
make_multitrack_fixture

printf 'Generated audio fixtures in %s\n' "$out_dir"

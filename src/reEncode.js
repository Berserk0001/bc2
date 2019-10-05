const redirect = require('./redirect')
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path
const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const ffmpeg = require("fluent-ffmpeg")
const fs = require('fs')
const os = require('os')
const {URL} = require('url')

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const VIDEO_QUALITY_MULTIPLIER = parseInt(process.env.VIDEO_QUALITY_MULTIPLIER) || 10
const AUDIO_QUALITY_MULTIPLIER = parseInt(process.env.AUDIO_QUALITY_MULTIPLIER) || 2
const MEDIA_TIMEOUT = parseInt(process.env.MEDIA_TIMEOUT) || 7200
const VIDEO_HEIGHT_THRESH = parseInt(process.env.VIDEO_HEIGHT_THRESH) || 360
const VIDEO_WEBM_CPU_USED = parseInt(process.env.VIDEO_WEBM_CPU_USED) || 7

function reEncode(req, res, input) {
    var quality = req.params.quality
    var vBitrateTarget = quality * VIDEO_QUALITY_MULTIPLIER //200 - 800
    var aBitrateTarget = quality * AUDIO_QUALITY_MULTIPLIER
    var timeoutSeconds = MEDIA_TIMEOUT //2 hours
    
    ffmpeg.ffprobe(req.params.url, function(err, metadata) {
        let audioStreamInfo, videoStreamInfo, audioOnly
        //format = metadata.format
        if(err || !metadata){
            console.error(err)
            return redirect(req, res)
        }
        if(metadata){
            for (let stream in metadata.streams){
                stream = metadata.streams[stream]
                if (videoStreamInfo && audioStreamInfo){
                    console.log("multiple audio or video streams detected")
                }
                //console.log(stream)
                switch(stream.codec_type){
                    case("video"):
                        videoStreamInfo = stream
                        break
                    case("audio"):
                        audioStreamInfo = stream
                        break
                }
            }
            audioOnly = !videoStreamInfo;
            
            if((!audioStreamInfo && !videoStreamInfo) || (audioStreamInfo && audioStreamInfo.bit_rate <= aBitrateTarget * 800 && audioOnly) || videoStreamInfo && (
                videoStreamInfo.bit_rate <= vBitrateTarget * 800 || videoStreamInfo.duration > 600)){
                return redirect(req, res)
            }
        }
        res.setHeader('content-type', `${audioOnly ? "audio":"video"}/webm`)
        
        //let {hostname, pathname} = new URL(req.params.url)
        //let path = `${os.tmpdir()}/${hostname + encodeURIComponent(pathname)}.webm`;
        
        if(audioOnly){
            ffmpeg({
                source: req.params.url,
                timeout: timeoutSeconds
            })
                .audioCodec("opus")
                .format("webm")
                .audioBitrate(aBitrateTarget)
                .on('error', function(err) {
                    console.error('An error occurred: ' + err.message)
                    return redirect(req, res)
                })
                .on('stderr', function(stderrLine) {
                    console.log('Stderr output: ' + stderrLine);
                })
                .pipe(res, { end: true })
        }else{
            ffmpeg({
                source: req.params.url,
                timeout: timeoutSeconds
            })
                .videoCodec("libvpx-vp9")//videoStreamInfo.codec_name)
                .videoBitrate(vBitrateTarget)
                .audioCodec("opus")//audioStreamInfo.codec_name)
                //.audioQuality(Math.ceil(quality / 20)) //1-4
                .audioBitrate(aBitrateTarget)
                .size(
                    '?x' + Math.min(VIDEO_HEIGHT_THRESH, videoStreamInfo ? videoStreamInfo.height : 0)
                )
                //.format(format.format_name.split(',')[0])
                .format('webm')
                .outputOptions(["-deadline realtime",`-cpu-used ${VIDEO_WEBM_CPU_USED}`])
                //.outputOptions("-movflags +frag_keyframe")
                .on('error', function(err) {
                    console.error('An error occurred: ' + err.message)
                    return redirect(req, res)
                })
                .on('stderr', function(stderrLine) {
                    console.log('Stderr output: ' + stderrLine)
                })
                .on('end', function() {
                console.log('Processing finished !')
                
                //res.end();
                // var readStream = fs.createReadStream(path)
                //   // This will wait until we know the readable stream is actually valid before piping
                //     readStream.on('open', function () {
                //       // This just pipes the read stream to the response object (which goes to the client)
                //       readStream.pipe(res);
                //     });
                    
                //     // This catches any errors that happen while creating the readable stream (usually invalid names)
                //     readStream.on('error', function(err) {
                //       res.end(err);
                //     });
                    
                //     readStream.on('end', function(err) {
                //       fs.unlink(path, function(){})
                //       res.end();
                //     });
                })
                .pipe(res, { end: true })
                //.save(path)
        }
        
    })
}

module.exports = reEncode

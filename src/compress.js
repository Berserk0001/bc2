const sharp = require('sharp')
const redirect = require('./redirect')
const isAnimated = require('is-animated')
const {execFile} = require('child_process')
const gif2webp = require('gif2webp-bin')
const fs = require('fs')
const os = require('os')
const {URL} = require('url')

function compress(req, res, input) {
  const format = req.params.webp ? 'webp' : 'jpeg'
  const originType = req.params.originType
  
  if(!process.env.DISABLE_ANIMATED && !req.params.grayscale && format === 'webp' && originType.endsWith('gif') && isAnimated(input)){
    let {hostname, pathname} = new URL(req.params.url)
    
    let path = `${os.tmpdir()}/${hostname + encodeURIComponent(pathname)}`;
    fs.writeFile(path + '.gif', input, (err) => {
        console.error(err)
        if (err) return redirect(req, res)
        //defer to gif2webp *higher latency*
        execFile(gif2webp, ['-lossy', '-m', 2, '-q', req.params.quality , '-mt', 
            `${path}.gif`,
            '-o', 
            `${path}.webp`], (convErr) => {
                if(convErr) console.error(convErr)
                console.log('GIF Image converted!')
                fs.readFile(`${path}.webp`, (readErr, data) => {
                    console.error(readErr);
                    if (readErr ||  res.headersSent) return redirect(req, res)

                    setResponseHeaders(fs.statSync(`${path}.webp`), 'webp')
                    
                    //Write to stream
                    res.write(data)
                    
                    //initiate cleanup procedures
                    fs.unlink(`${path}.gif`, function(){})
                    fs.unlink(`${path}.webp`, function(){})
                    
                    res.end()
                })
        })
    })
    
  }else{

    const image = sharp(input);
    
    image
        .metadata(function(err, metadata){
            let pixelCount = metadata.width * metadata.height;
            var compressionQuality = req.params.quality;
            
            //3MP or 1.5MB
            if(pixelCount > 3000000 || metadata.size > 1536000){
                compressionQuality *= 0.1
            //2MP or 1MB
            }else if(pixelCount > 2000000 && metadata.size > 1024000){
                compressionQuality *= 0.25
            //1MP or 512KB
            }else if(pixelCount > 1000000 && metadata.size > 512000){
                compressionQuality *= 0.5
            //0.5MP or 256KB
            }else if(pixelCount > 500000 && metadata.size > 256000){
                compressionQuality *= 0.75
            }
            compressionQuality = Math.ceil(compressionQuality)
            
            sharp(input)
            .grayscale(req.params.grayscale)
            .toFormat(format, {
                quality: compressionQuality,
                progressive: true,
                optimizeScans: true
            })
            .toBuffer((err, output, info) => {
                if (err || !info || res.headersSent) return redirect(req, res)

                setResponseHeaders(info, format)
                res.write(output)
                res.end()
            })
        })
    }
    
    function setResponseHeaders (info, imgFormat){
        res.setHeader('content-type', `image/${imgFormat}`)
        res.setHeader('content-length', info.size)
        let filename = (new URL(req.params.url).pathname.split('/').pop() || "image") + '.' + format
        res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"' )
        res.setHeader('x-original-size', req.params.originSize)
        res.setHeader('x-bytes-saved', req.params.originSize - info.size)
        res.status(200)
    }
}

module.exports = compress

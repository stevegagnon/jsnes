import { default as NES, Button } from '@nes/index';

var SCREEN_WIDTH = 256;
var SCREEN_HEIGHT = 240;
var FRAMEBUFFER_SIZE = SCREEN_WIDTH * SCREEN_HEIGHT;

var canvas_ctx, image;
var framebuffer_u8, framebuffer_u32;

var AUDIO_BUFFERING = 512;
var SAMPLE_COUNT = 4 * 1024;
var SAMPLE_MASK = SAMPLE_COUNT - 1;
var audio_samples_L = new Float32Array(SAMPLE_COUNT);
var audio_samples_R = new Float32Array(SAMPLE_COUNT);
var audio_write_cursor = 0, audio_read_cursor = 0;

var running = false;
let state;
let rom;

var nes = NES({
  onFrame: function (framebuffer_24) {
    for (var i = 0; i < FRAMEBUFFER_SIZE; i++) framebuffer_u32[i] = 0xFF000000 | framebuffer_24[i];
  },
  onAudioSample: function (l, r) {
    audio_samples_L[audio_write_cursor] = l;
    audio_samples_R[audio_write_cursor] = r;
    audio_write_cursor = (audio_write_cursor + 1) & SAMPLE_MASK;
  },
});

function onAnimationFrame() {
  window.requestAnimationFrame(onAnimationFrame);

  image.data.set(framebuffer_u8);
  canvas_ctx.putImageData(image, 0, 0);
}

function audio_remain() {
  return (audio_write_cursor - audio_read_cursor) & SAMPLE_MASK;
}

function audio_callback(event) {
  if (!running) {
    var dst = event.outputBuffer;
    var dst_l = dst.getChannelData(0);
    var dst_r = dst.getChannelData(1);

    dst_l.fill(0);
    dst_r.fill(0);
    
  } else {
    try {
      var dst = event.outputBuffer;
      var len = dst.length;
    
      // Attempt to avoid buffer underruns.
      if (audio_remain() < AUDIO_BUFFERING) nes.frame();
    
      var dst_l = dst.getChannelData(0);
      var dst_r = dst.getChannelData(1);
      for (var i = 0; i < len; i++) {
        var src_idx = (audio_read_cursor + i) & SAMPLE_MASK;
        dst_l[i] = audio_samples_L[src_idx];
        dst_r[i] = audio_samples_R[src_idx];
      }
    
      audio_read_cursor = (audio_read_cursor + len) & SAMPLE_MASK;
    } catch (e) {
      running = false;
      throw e;
    }
  }


}

function keyboard(callback, event) {
  var player = 1;
  switch (event.keyCode) {
    case 38: // UP
      callback(player, Button.UP); break;
    case 40: // Down
      callback(player, Button.DOWN); break;
    case 37: // Left
      callback(player, Button.LEFT); break;
    case 39: // Right
      callback(player, Button.RIGHT); break;
    case 65: // 'a' - qwerty, dvorak
    case 81: // 'q' - azerty
      callback(player, Button.A); break;
    case 83: // 's' - qwerty, azerty
    case 79: // 'o' - dvorak
      callback(player, Button.B); break;
    case 9: // Tab
      callback(player, Button.SELECT); break;
    case 13: // Return
      callback(player, Button.START); break;
    default: break;
  }
}

function nes_init(canvas_id) {
  var canvas = document.getElementById(canvas_id) as HTMLCanvasElement;
  canvas_ctx = canvas.getContext("2d");
  image = canvas_ctx.getImageData(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  canvas_ctx.fillStyle = "black";
  canvas_ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

  // Allocate framebuffer array.
  var buffer = new ArrayBuffer(image.data.length);
  framebuffer_u8 = new Uint8ClampedArray(buffer);
  framebuffer_u32 = new Uint32Array(buffer);

  // Setup audio.
  var audio_ctx = new window.AudioContext();
  var script_processor = audio_ctx.createScriptProcessor(AUDIO_BUFFERING, 0, 2);
  script_processor.onaudioprocess = audio_callback;
  script_processor.connect(audio_ctx.destination);
}

function nes_boot(rom_data) {
  nes.loadROM(rom_data);
  window.requestAnimationFrame(onAnimationFrame);
}


document.addEventListener('keydown', (event) => { keyboard(nes.buttonDown, event) });
document.addEventListener('keyup', (event) => { keyboard(nes.buttonUp, event) });

fetch('InterglacticTransmissing.nes')
  .then(response => response.arrayBuffer())
  .then(data => {
    rom = data;
    nes_init('nes-canvas')
    nes_boot(data);
  });

const pauseButton = document.getElementById('pause');

pauseButton.addEventListener('click', () => {
  running = !running;
});

document.getElementById('serialize').addEventListener('click', () => {
  state = nes.toJSON();
  console.log(state);
});

document.getElementById('deserialize').addEventListener('click', () => {
  nes.fromJSON(state);
});

document.getElementById('reload').addEventListener('click', () => {
  nes.loadROM(rom);
});


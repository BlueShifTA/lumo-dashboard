#!/usr/bin/env python3
"""
Beluga Camera Service: GStreamer-based camera interface
Works with NVIDIA Jetson CSI cameras (nvarguscamerasrc)
"""

import gi
gi.require_version('Gst', '1.0')
from gi.repository import Gst, GLib
import numpy as np
import threading
import time
from pathlib import Path

class BelugaCamera:
    def __init__(self, width=1920, height=1080, fps=30):
        """Initialize camera with GStreamer."""
        self.width = width
        self.height = height
        self.fps = fps
        self.latest_frame = None
        self.lock = threading.Lock()
        self.running = False
        
        # Initialize GStreamer
        Gst.init(None)
        
        # Create pipeline
        pipeline_str = (
            f'nvarguscamerasrc sensor-id=0 ! '
            f'video/x-raw(memory:NVMM), width={width}, height={height}, format=NV12, framerate={fps}/1 ! '
            f'nvvidconv ! '
            f'video/x-raw, format=BGRx ! '
            f'videoconvert ! '
            f'video/x-raw, format=BGR ! '
            f'appsink name=sink drop=true max-buffers=1'
        )
        
        self.pipeline = Gst.parse_launch(pipeline_str)
        self.sink = self.pipeline.get_by_name('sink')
        
        # Setup bus for error handling
        bus = self.pipeline.get_bus()
        bus.add_signal_watch()
        bus.connect("message", self._on_message)
        
        print(f"🐋 Beluga Camera Service initialized")
        print(f"   Resolution: {width}x{height}")
        print(f"   FPS: {fps}")
    
    def _on_message(self, bus, message):
        """Handle GStreamer messages."""
        msg_type = message.type
        if msg_type == Gst.MessageType.ERROR:
            err, debug = message.parse_error()
            print(f"❌ GStreamer error: {err}")
            print(f"   Debug: {debug}")
    
    def start(self):
        """Start camera stream."""
        if self.running:
            return
        
        print("▶️  Starting camera stream...")
        ret = self.pipeline.set_state(Gst.State.PLAYING)
        
        if ret == Gst.StateChangeReturn.ASYNC:
            state_ret, state, pending = self.pipeline.get_state(Gst.CLOCK_TIME_NONE)
        
        self.running = True
        self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.capture_thread.start()
        print("✅ Camera stream started")
    
    def _capture_loop(self):
        """Continuously capture frames."""
        while self.running:
            try:
                sample = self.sink.emit('pull-sample')
                if sample:
                    buf = sample.get_buffer()
                    result, mapinfo = buf.map(Gst.MapFlags.READ)
                    
                    if result:
                        # Convert to numpy array
                        frame = np.frombuffer(mapinfo.data, np.uint8)
                        frame = frame.reshape((self.height, self.width, 3))
                        
                        with self.lock:
                            self.latest_frame = frame.copy()
                        
                        buf.unmap(mapinfo)
            except Exception as e:
                print(f"⚠️  Capture error: {e}")
                time.sleep(0.1)
    
    def read(self):
        """Get latest frame."""
        with self.lock:
            if self.latest_frame is not None:
                return self.latest_frame.copy()
        return None
    
    def stop(self):
        """Stop camera stream."""
        if not self.running:
            return
        
        self.running = False
        self.pipeline.set_state(Gst.State.NULL)
        if hasattr(self, 'capture_thread'):
            self.capture_thread.join(timeout=2)
        print("✅ Camera stream stopped")
    
    def save_frame(self, filename):
        """Save current frame to file."""
        import cv2
        frame = self.read()
        if frame is not None:
            cv2.imwrite(filename, frame)
            return True
        return False

# Test
if __name__ == "__main__":
    import cv2
    
    print("🐋 Beluga Camera Service Test\n")
    
    # Create camera
    camera = BelugaCamera(width=1920, height=1080, fps=30)
    camera.start()
    
    # Wait for frames to start arriving
    print("⏳ Waiting for frames...")
    for i in range(5):
        frame = camera.read()
        if frame is not None:
            print(f"✅ Frame received: {frame.shape}")
            
            # Save frame
            output_path = Path.home() / ".openclaw/workspace/beluga_camera_live.jpg"
            cv2.imwrite(str(output_path), frame)
            print(f"💾 Saved to {output_path}")
            break
        else:
            print(f"⏳ Waiting... ({i+1}/5)")
            time.sleep(1)
    
    # Keep running for a bit
    time.sleep(2)
    
    camera.stop()
    print("\n✅ Test complete")

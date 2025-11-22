import base64
import struct

def create_simple_png(width, height, data):
    """Create a simple PNG file from raw pixel data"""
    
    def write_png_chunk(chunk_type, data):
        length = len(data)
        crc = 0xffffffff
        for byte in data:
            crc ^= byte
            for _ in range(8):
                if crc & 1:
                    crc = (crc >> 1) ^ 0xedb88320
                else:
                    crc >>= 1
        crc ^= 0xffffffff
        return struct.pack('>I', length) + chunk_type + data + struct.pack('>I', crc)
    
    # PNG signature
    png_data = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    png_data += write_png_chunk(b'IHDR', ihdr_data)
    
    # IDAT chunk (simplified - just solid color)
    idat_data = b'\x78\x9c' + b'\x00' * (width * height * 3 + height)
    png_data += write_png_chunk(b'IDAT', idat_data)
    
    # IEND chunk
    png_data += write_png_chunk(b'IEND', b'')
    
    return png_data

# Create a simple gradient PNG for 128x128
def create_gradient_icon(size):
    """Create a gradient icon"""
    # Create RGBA data
    data = bytearray()
    center = size // 2
    
    for y in range(size):
        for x in range(size):
            # Calculate distance from center
            dx = x - center
            dy = y - center
            distance = (dx*dx + dy*dy)**0.5
            max_distance = center * 0.8
            
            if distance <= max_distance:
                # Gradient from purple to blue
                ratio = distance / max_distance
                r = int(102 + (118 - 102) * ratio)
                g = int(126 + (75 - 126) * ratio) 
                b = int(234 + (162 - 234) * ratio)
                a = 255
            else:
                r, g, b, a = 0, 0, 0, 0
            
            data.extend([r, g, b, a])
    
    return create_simple_png(size, size, data)

# Create icons for all sizes
sizes = [16, 32, 48, 128]
for size in sizes:
    png_data = create_gradient_icon(size)
    with open(f'icons/icon{size}.png', 'wb') as f:
        f.write(png_data)
    print(f'Created icon{size}.png')

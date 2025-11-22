#!/usr/bin/env python3
"""
Script to convert SVG icon to PNG format for Chrome extension
"""

import os
import sys

def create_png_from_svg():
    """Create PNG files from SVG using different methods"""
    
    # Method 1: Try using cairosvg (if available)
    try:
        import cairosvg
        print("Using cairosvg to convert SVG to PNG...")
        
        # Convert to different sizes
        sizes = [16, 32, 48, 128]
        svg_path = "icons/icon128.svg"
        
        for size in sizes:
            png_path = f"icons/icon{size}.png"
            cairosvg.svg2png(url=svg_path, write_to=png_path, output_width=size, output_height=size)
            print(f"Created {png_path}")
        
        return True
        
    except ImportError:
        print("cairosvg not available, trying alternative method...")
    
    # Method 2: Try using PIL with basic shapes
    try:
        from PIL import Image, ImageDraw
        print("Using PIL to create PNG icons...")
        
        sizes = [16, 32, 48, 128]
        
        for size in sizes:
            # Create a new image with transparent background
            img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            
            # Draw gradient background (simplified)
            center = size // 2
            radius = int(size * 0.4)
            
            # Draw gradient circles
            for i in range(radius, 0, -1):
                ratio = i / radius
                r = int(102 + (118 - 102) * ratio)  # Purple to blue gradient
                g = int(126 + (75 - 126) * ratio)
                b = int(234 + (162 - 234) * ratio)
                draw.ellipse([center-i, center-i, center+i, center+i], fill=(r, g, b, 255))
            
            # Draw white inner circle
            inner_radius = int(radius * 0.8)
            draw.ellipse([center-inner_radius, center-inner_radius, 
                         center+inner_radius, center+inner_radius], 
                        fill=(255, 255, 255, 200))
            
            # Draw email icon
            email_size = int(size * 0.3)
            email_x = center - email_size // 2
            email_y = center - email_size // 2
            
            # Email body
            draw.rectangle([email_x, email_y + email_size//3, 
                          email_x + email_size, email_y + email_size], 
                         fill=(255, 255, 255, 255), outline=(102, 126, 234, 255), width=max(1, size//32))
            
            # Email flap
            flap_points = [(email_x, email_y + email_size//3),
                          (email_x + email_size//2, email_y + email_size//6),
                          (email_x + email_size, email_y + email_size//3)]
            draw.polygon(flap_points, fill=(255, 255, 255, 255), outline=(102, 126, 234, 255), width=max(1, size//32))
            
            # Draw task board
            board_y = int(center + size * 0.15)
            board_width = int(size * 0.6)
            board_height = int(size * 0.2)
            board_x = center - board_width // 2
            
            # Three columns
            col_width = board_width // 3
            for i in range(3):
                col_x = board_x + i * col_width
                col_color = [(226, 232, 240), (219, 234, 254), (220, 252, 231)][i]  # Gray, Blue, Green
                draw.rectangle([col_x, board_y, col_x + col_width - 2, board_y + board_height], 
                             fill=col_color, outline=(203, 213, 225, 255), width=max(1, size//64))
            
            # Checkmark on last column
            check_x = board_x + 2 * col_width + col_width // 2
            check_y = board_y + board_height // 2
            check_size = max(2, size // 16)
            draw.ellipse([check_x - check_size, check_y - check_size, 
                         check_x + check_size, check_y + check_size], 
                        fill=(16, 185, 129, 255))
            
            # Save the image
            png_path = f"icons/icon{size}.png"
            img.save(png_path)
            print(f"Created {png_path}")
        
        return True
        
    except ImportError:
        print("PIL not available, creating placeholder files...")
    
    # Method 3: Create placeholder files with instructions
    sizes = [16, 32, 48, 128]
    for size in sizes:
        placeholder_path = f"icons/icon{size}.png"
        with open(placeholder_path, 'w') as f:
            f.write(f"# Placeholder for icon{size}.png\n")
            f.write(f"# Size: {size}x{size} pixels\n")
            f.write("# Convert icons/icon128.svg to PNG format\n")
            f.write("# Use online SVG to PNG converter or image editing software\n")
        print(f"Created placeholder {placeholder_path}")
    
    return False

if __name__ == "__main__":
    print("Creating PNG icons for AgileEmails Chrome Extension...")
    success = create_png_from_svg()
    
    if success:
        print("\n✅ Successfully created PNG icons!")
    else:
        print("\n⚠️  Created placeholder files. Please convert icons/icon128.svg to PNG format manually.")
        print("   You can use online tools like:")
        print("   - https://convertio.co/svg-png/")
        print("   - https://cloudconvert.com/svg-to-png")
        print("   - Or any image editing software")

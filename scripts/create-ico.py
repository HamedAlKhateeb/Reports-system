import os
from PIL import Image

public_dir = os.path.abspath('public')
app_dir = os.path.abspath('app')

# Sizes for ICO: 16x16, 32x32, 48x48
img_paths = [
    os.path.join(public_dir, 'icon-16.png'),
    os.path.join(public_dir, 'icon-32.png'),
    os.path.join(public_dir, 'icon-48.png'),
]

images = [Image.open(p) for p in img_paths]

# Primary image is 32x32 or 48x48
primary = images[1] # 32x32
other_sizes = [(16, 16), (32, 32), (48, 48)]

# Save to public/favicon.ico
ico_public = os.path.join(public_dir, 'favicon.ico')
primary.save(ico_public, format='ICO', sizes=other_sizes)
print(f"Saved {ico_public}")

# Save to app/favicon.ico
ico_app = os.path.join(app_dir, 'favicon.ico')
primary.save(ico_app, format='ICO', sizes=other_sizes)
print(f"Saved {ico_app}")

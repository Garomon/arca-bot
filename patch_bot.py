
import os

target_file = r"c:\Users\garom\Desktop\Grid Bots Crypto\Grid Bot Arca Garossa BTC - USDT\grid_bot.js"
new_block_file = r"c:\Users\garom\Desktop\Grid Bots Crypto\Grid Bot Arca Garossa BTC - USDT\new_block.js"

with open(target_file, 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open(new_block_file, 'r', encoding='utf-8') as f:
    new_content = f.read()

# Lines to replace: 2240 to 2873 (1-based)
# Indices: 2239 to 2872 (inclusive)
# Slice to remove: [2239:2873]

start_idx = 2239
end_idx = 2873

# Safety check
print(f"Total lines: {len(lines)}")
print(f"Removing lines {start_idx+1} to {end_idx}:")
print(f"Start line content: {lines[start_idx].strip()}")
print(f"End line content: {lines[end_idx-1].strip()}")
print(f"Next line content (should be STARTUP): {lines[end_idx].strip()}")

new_lines = lines[:start_idx] + [new_content + "\n"] + lines[end_idx:]

# Write back
with open(target_file, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Patch applied successfully.")

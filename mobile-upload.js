const { glob } = require('glob');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- CONFIGURATION ---
// Your custom Cloudflare domain linked to Firebase
const LIVE_DOMAIN = 'https://tmpnews.786313.xyz'; 

const RAW_INPUT = './raw_images';
// Output folder matches your folder structure: Public/TMP_news/images
const REPO_DIR = './Public/TMP_news/images'; 
const ARCHIVE_DIR = './already_optimize_image';
const URL_LOG_DIR = './optimized_image_url';

// File paths for URL logs
const LOG_FILE_LIVE = path.join(URL_LOG_DIR, 'generated_webp_image_url.txt');
const LOG_FILE_TEST = path.join(URL_LOG_DIR, 'testing_url.txt');

// Ensure all folders exist
[REPO_DIR, ARCHIVE_DIR, URL_LOG_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function processMobileImages() {
    console.log('📱 Scanning raw_images folder...');
    
    // Find images (jpg, jpeg, png, or even existing webp inputs)
    const files = await glob(`${RAW_INPUT}/**/*.{jpg,jpeg,png,webp,JPG,JPEG,PNG}`);

    if (files.length === 0) {
        console.log('⚠️ No images found in ./raw_images');
        return;
    }

    let newLiveLinks = [];
    let newTestLinks = [];
    let successCount = 0;

    for (const file of files) {
        const filename = path.basename(file, path.extname(file));
        const originalExt = path.extname(file);
        
        // Clean filename (remove spaces/symbols)
        const cleanName = filename.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-_]/g, '');
        const outputWebp = path.join(REPO_DIR, `${cleanName}.webp`);

        console.log(`⚙️ Processing: ${filename}${originalExt}...`);

        try {
            // 1. Get Original Size
            const statsBefore = fs.statSync(file);
            const sizeBeforeKB = (statsBefore.size / 1024).toFixed(2);

            // --- 2. CONVERT & COMPRESS (using cwebp) ---
            // -q 60: Quality
            // -m 6: Maximum compression
            // -resize 1280 0: Resize width to 1280px (keep aspect ratio)
            // Note: This requires 'libwebp' installed in Termux
            execSync(`cwebp -q 60 -m 6 -resize 1280 0 "${file}" -o "${outputWebp}"`);
            
            // ----------------------------------------------------

            // 3. Get New Size
            const statsAfter = fs.statSync(outputWebp);
            const sizeAfterKB = (statsAfter.size / 1024).toFixed(2);
            const savings = ((1 - (statsAfter.size / statsBefore.size)) * 100).toFixed(1);

            console.log(`   ✅ Saved: ${cleanName}.webp`);
            console.log(`   📉 Size: ${sizeBeforeKB} KB ➡️ ${sizeAfterKB} KB (Saved ${savings}%)`);

            // 4. Generate URLs based on your folder structure
            // Structure: https://tmpnews.786313.xyz/TMP_news/images/image.webp
            const liveUrl = `${LIVE_DOMAIN}/TMP_news/images/${cleanName}.webp`;
            const testUrl = `${LIVE_DOMAIN}/TMP_news/images/${cleanName}.webp`; // Same for now, or change if you have a test domain
            
            newLiveLinks.push(liveUrl);
            newTestLinks.push(testUrl);

            // 5. Move Raw File to Archive (Organized by Date)
            const now = new Date();
            const year = now.getFullYear();
            const monthName = now.toLocaleString('en-US', { month: 'long' });
            const dayNumber = now.getDate();

            // Create folder path: already_optimize_image/2026/January/14
            const dateFolder = path.join(ARCHIVE_DIR, year.toString(), monthName, dayNumber.toString());
            
            if (!fs.existsSync(dateFolder)) {
                fs.mkdirSync(dateFolder, { recursive: true });
            }

            const archivePath = path.join(dateFolder, path.basename(file));
            fs.renameSync(file, archivePath);
            
            successCount++;

        } catch (e) {
            console.error(`❌ Failed to convert ${filename}`);
            console.error(e.message);
        }
    }

    // --- SAVE LINKS (Newest on Top) ---
    const saveLinks = (filePath, newLinks) => {
        let content = '';
        if (fs.existsSync(filePath)) {
            content = fs.readFileSync(filePath, 'utf8');
        }
        const finalContent = newLinks.join('\n\n') + '\n\n' + content;
        fs.writeFileSync(filePath, finalContent);
    };

    if (newLiveLinks.length > 0) {
        saveLinks(LOG_FILE_LIVE, newLiveLinks);
        saveLinks(LOG_FILE_TEST, newTestLinks);
        console.log(`📝 URLs saved to ${URL_LOG_DIR}`);
    }

    // --- GITHUB PUSH (Using Git) ---
    console.log('🚀 Pushing to GitHub...');
    try {
        // Add only Public (images) and optimized_image_url (logs), ignore raw/archive due to gitignore
        execSync('git add .');
        
        // Check if there is anything to commit
        try {
            execSync(`git commit -m "Mobile Upload: ${successCount} new images"`);
            execSync('git push origin main'); // Assuming your branch is 'main'
            console.log('✅ DONE! Images and Logs are live.');
        } catch (e) {
            // Error usually means nothing to commit
            console.log('⚠️ No changes detected to commit.');
        }

    } catch (e) {
        console.log('❌ Git Push Error.');
        console.error(e.message);
    }
}

processMobileImages();

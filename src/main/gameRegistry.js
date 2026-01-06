const { execSync } = require("child_process");

function getSporeInstallPath() {
    try {
        const output = execSync(
            'reg query "HKLM\\SOFTWARE\\WOW6432Node\\electronic arts\\SPORE_EP1" /v datadir',
            { encoding: "utf8" }
        );
        const match = output.match(/datadir\s+REG_SZ\s+([^\r\n]+)/);
        if (match) {
            return match[1].trim();
        }
    } catch (e) {
        return null;
    }
    return null;
}

module.exports = { getSporeInstallPath };
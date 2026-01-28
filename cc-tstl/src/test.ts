declare const _CC_VERSION: string | undefined;

const MIN_CC_VERSION = "1.85.0";

function versionToParts(version: string): [number, number, number] {
    const parts = version.split(".");
    return [parseInt(parts[0] ?? "0"), parseInt(parts[1] ?? "0"), parseInt(parts[2] ?? "0")];
}

function requireMinVersion(minVersion: string): void {
    let version: string | undefined;
    if (_CC_VERSION) {
        version = _CC_VERSION;
        print("Using _CC_VERSION: " + version);
    } else if (!_HOST) {
        version = string.gsub(os.version(), "CraftOS ", "")[0];
        print("Using os.version(): " + version);
    } else {
        version = string.match(_HOST, "ComputerCraft ([0-9%.]+)")[0];
        print("Using _HOST: " + version);
    }    
    if (!version) {
        error("Could not determine version of ComputerCraft");
    } else {
        const versionParts = versionToParts(version);
        const minParts = versionToParts(minVersion);
        assert(versionParts[0] >= minParts[0] && versionParts[1] >= minParts[1] && versionParts[2] >= minParts[2], "This program requires ComputerCraft " + minVersion + " or later.");
        print("Version is " + version + " which is greater than or equal to " + minVersion);
    }
}

requireMinVersion(MIN_CC_VERSION);
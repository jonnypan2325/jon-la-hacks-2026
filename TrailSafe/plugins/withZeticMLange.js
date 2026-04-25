/**
 * Expo config plugin that integrates the Zetic MLange iOS SDK.
 *
 * During `npx expo prebuild --platform ios` this plugin:
 *   1. Copies the Swift/ObjC native module files into the generated ios/ directory
 *   2. Adds them to the Xcode project's build phases
 *   3. Adds the ZeticMLangeiOS Swift Package (SPM) dependency
 *   4. Sets the iOS deployment target to 16.0 (Zetic SDK minimum)
 *   5. Ensures the bridging header includes React Native imports
 *   6. Updates the Podfile deployment target
 */

const { withXcodeProject, withDangerousMod, withInfoPlist } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SPM_URL = 'https://github.com/zetic-ai/ZeticMLangeiOS.git';
const SPM_VERSION = '1.6.0';
const IOS_DEPLOYMENT_TARGET = '16.0';

function withZeticMLange(config) {
  // Phase 0: Inject ZeticPersonalKey from ZETIC_PERSONAL_KEY env var into Info.plist
  config = withInfoPlist(config, (config) => {
    const key = process.env.ZETIC_PERSONAL_KEY;
    if (!key || key.trim() === '') {
      throw new Error(
        'ZETIC_PERSONAL_KEY environment variable is not set. ' +
        'Copy TrailSafe/.env.example to TrailSafe/.env and add your Zetic personal key, ' +
        'then re-run expo prebuild.',
      );
    }
    config.modResults.ZeticPersonalKey = key;
    return config;
  });

  // Phase 1: Copy native files and patch Podfile (runs after Xcode project mods)
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const projectName = config.modRequest.projectName ?? 'TrailSafe';
      const targetDir = path.join(projectRoot, 'ios', projectName);

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Copy Swift and ObjC files from plugins/native/ into ios/<AppName>/
      const nativeDir = path.join(projectRoot, 'plugins', 'native');
      for (const file of ['ZeticMLangeModule.swift', 'ZeticMLangeModule.m']) {
        const src = path.join(nativeDir, file);
        const dest = path.join(targetDir, file);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dest);
        }
      }

      // Ensure bridging header includes React Native imports
      const bhPath = path.join(targetDir, `${projectName}-Bridging-Header.h`);
      let bh = fs.existsSync(bhPath) ? fs.readFileSync(bhPath, 'utf-8') : '';
      if (!bh.includes('RCTBridgeModule')) {
        bh += '#import <React/RCTBridgeModule.h>\n#import <React/RCTEventEmitter.h>\n';
        fs.writeFileSync(bhPath, bh);
      }

      // Update Podfile deployment target
      const podfilePath = path.join(projectRoot, 'ios', 'Podfile');
      if (fs.existsSync(podfilePath)) {
        let podfile = fs.readFileSync(podfilePath, 'utf-8');
        podfile = podfile.replace(
          /platform :ios, podfile_properties\['ios\.deploymentTarget'\] \|\| '[^']+'/,
          `platform :ios, podfile_properties['ios.deploymentTarget'] || '${IOS_DEPLOYMENT_TARGET}'`,
        );
        fs.writeFileSync(podfilePath, podfile);
      }

      return config;
    },
  ]);

  // Phase 2: Modify Xcode project (add sources, SPM, deployment target)
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    const projectName = config.modRequest.projectName ?? 'TrailSafe';

    // --- Add source files to the Xcode project ---
    project.addSourceFile(`${projectName}/ZeticMLangeModule.swift`);
    project.addSourceFile(`${projectName}/ZeticMLangeModule.m`);

    // --- Set iOS deployment target for all build configurations ---
    const buildConfigs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(buildConfigs)) {
      const bc = buildConfigs[key];
      if (typeof bc === 'object' && bc.buildSettings) {
        if (bc.buildSettings.IPHONEOS_DEPLOYMENT_TARGET) {
          bc.buildSettings.IPHONEOS_DEPLOYMENT_TARGET = IOS_DEPLOYMENT_TARGET;
        }
        // Set bridging header for Swift <-> ObjC interop
        if (bc.buildSettings.PRODUCT_NAME) {
          bc.buildSettings.SWIFT_OBJC_BRIDGING_HEADER =
            `"${projectName}/${projectName}-Bridging-Header.h"`;
        }
      }
    }

    // --- Add SPM package dependency (idempotent) ---

    // Initialize SPM sections if missing
    if (!project.hash.project.objects.XCRemoteSwiftPackageReference) {
      project.hash.project.objects.XCRemoteSwiftPackageReference = {};
    }
    if (!project.hash.project.objects.XCSwiftPackageProductDependency) {
      project.hash.project.objects.XCSwiftPackageProductDependency = {};
    }

    const existingPackageRefs = project.hash.project.objects.XCRemoteSwiftPackageReference;
    const existingPkgDeps = project.hash.project.objects.XCSwiftPackageProductDependency;

    // Find or create the remote package reference
    let pkgRefUuid = Object.keys(existingPackageRefs).find((key) => {
      const ref = existingPackageRefs[key];
      return typeof ref === 'object' && ref.repositoryURL === SPM_URL;
    });
    if (!pkgRefUuid) {
      pkgRefUuid = project.generateUuid();
      existingPackageRefs[pkgRefUuid] = {
        isa: 'XCRemoteSwiftPackageReference',
        repositoryURL: SPM_URL,
        requirement: {
          kind: 'exactVersion',
          version: SPM_VERSION,
        },
      };
      existingPackageRefs[`${pkgRefUuid}_comment`] = 'XCRemoteSwiftPackageReference "ZeticMLangeiOS"';
    }

    // Find or create the package product dependency
    let pkgDepUuid = Object.keys(existingPkgDeps).find((key) => {
      const dep = existingPkgDeps[key];
      return typeof dep === 'object' && dep.productName === 'ZeticMLange';
    });
    if (!pkgDepUuid) {
      pkgDepUuid = project.generateUuid();
      existingPkgDeps[pkgDepUuid] = {
        isa: 'XCSwiftPackageProductDependency',
        package: pkgRefUuid,
        productName: 'ZeticMLange',
      };
      existingPkgDeps[`${pkgDepUuid}_comment`] = 'ZeticMLange';
    }

    // Add package reference to the root project object (only if not already present)
    const rootProject = project.getFirstProject().firstProject;
    if (!rootProject.packageReferences) {
      rootProject.packageReferences = [];
    }
    const alreadyInPackageRefs = rootProject.packageReferences.some((r) => r.value === pkgRefUuid);
    if (!alreadyInPackageRefs) {
      rootProject.packageReferences.push({
        value: pkgRefUuid,
        comment: 'XCRemoteSwiftPackageReference "ZeticMLangeiOS"',
      });
    }

    // Add product dependency to the app target (only if not already present)
    const targetUuid = project.getFirstTarget().uuid;
    const nativeTarget = project.hash.project.objects.PBXNativeTarget[targetUuid];
    if (nativeTarget) {
      if (!nativeTarget.packageProductDependencies) {
        nativeTarget.packageProductDependencies = [];
      }
      if (!nativeTarget.packageProductDependencies.includes(pkgDepUuid)) {
        nativeTarget.packageProductDependencies.push(pkgDepUuid);
      }
    }

    return config;
  });

  return config;
}

module.exports = withZeticMLange;

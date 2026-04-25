import Foundation
import React
import ZeticMLange

@objc(ZeticMLange)
class ZeticMLangeModule: NSObject {

  private var model: ZeticMLangeLLMModel?

  @objc
  func generate(_ prompt: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let personalKey = Bundle.main.infoDictionary?["ZeticPersonalKey"] as? String,
          !personalKey.isEmpty else {
      reject("ZETIC_CONFIG_ERROR", "ZeticPersonalKey not found in Info.plist. Set the ZETIC_PERSONAL_KEY environment variable before running expo prebuild.", nil)
      return
    }
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        if self.model == nil {
          self.model = try ZeticMLangeLLMModel(
            personalKey: personalKey,
            name: "Steve/Qwen3.5-2B",
            version: 1,
            modelMode: LLMModelMode.RUN_AUTO,
            onDownload: { _ in }
          )
        }

        try self.model!.run(prompt)

        var buffer = ""
        while true {
          let waitResult = self.model!.waitForNextToken()
          let token = waitResult.token
          let generatedTokens = waitResult.generatedTokens
          if generatedTokens == 0 { break }
          buffer.append(token)
        }

        resolve(buffer)
      } catch {
        reject("ZETIC_ERROR", "Zetic generation failed: \(error.localizedDescription)", error)
      }
    }
  }

  @objc
  func healthCheck(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    guard let personalKey = Bundle.main.infoDictionary?["ZeticPersonalKey"] as? String,
          !personalKey.isEmpty else {
      reject("ZETIC_CONFIG_ERROR", "ZeticPersonalKey not found in Info.plist. Set the ZETIC_PERSONAL_KEY environment variable before running expo prebuild.", nil)
      return
    }
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        if self.model == nil {
          self.model = try ZeticMLangeLLMModel(
            personalKey: personalKey,
            name: "Steve/Qwen3.5-2B",
            version: 1,
            modelMode: LLMModelMode.RUN_AUTO,
            onDownload: nil
          )
        }
        resolve(true)
      } catch {
        resolve(false)
      }
    }
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}

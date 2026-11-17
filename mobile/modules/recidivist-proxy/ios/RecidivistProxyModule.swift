import ExpoModulesCore

/// Stores the proxy config; it is applied to React Native's NSURLSession at app launch.
public class RecidivistProxyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RecidivistProxy")
    Function("setProxy") { (cfg: [String: Any]) -> Bool in
      UserDefaults.standard.set(cfg, forKey: "recidivist.proxy")
      return false // applied on next launch (NSURLSession is created once)
    }
  }
}

public class RecidivistProxyAppDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    RecidivistProxyInstaller.install()
    return true
  }
}

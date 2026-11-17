#import "RecidivistProxyInstaller.h"
#import <React/RCTHTTPRequestHandler.h>

@implementation RecidivistProxyInstaller
+ (void)install {
  NSDictionary *cfg = [[NSUserDefaults standardUserDefaults] dictionaryForKey:@"recidivist.proxy"];
  if (![cfg[@"enabled"] boolValue]) return;
  NSString *host = cfg[@"host"];
  NSNumber *port = @([cfg[@"port"] integerValue]);
  if (host.length == 0 || port.integerValue <= 0) return;
  BOOL socks = [cfg[@"type"] isEqualToString:@"socks5"];
  NSString *user = cfg[@"user"] ?: @"";
  NSString *pass = cfg[@"pass"] ?: @"";
  RCTSetCustomNSURLSessionConfigurationProvider(^NSURLSessionConfiguration *{
    NSURLSessionConfiguration *c = [NSURLSessionConfiguration defaultSessionConfiguration];
    NSMutableDictionary *p = [NSMutableDictionary dictionary];
    if (socks) {
      p[@"SOCKSEnable"] = @1; p[@"SOCKSProxy"] = host; p[@"SOCKSPort"] = port;
      if (user.length) { p[@"SOCKSUser"] = user; p[@"SOCKSPassword"] = pass; }
    } else {
      p[@"HTTPEnable"] = @1; p[@"HTTPProxy"] = host; p[@"HTTPPort"] = port;
      p[@"HTTPSEnable"] = @1; p[@"HTTPSProxy"] = host; p[@"HTTPSPort"] = port;
    }
    c.connectionProxyDictionary = p;
    c.HTTPShouldSetCookies = YES;
    c.HTTPCookieAcceptPolicy = NSHTTPCookieAcceptPolicyAlways;
    c.HTTPCookieStorage = [NSHTTPCookieStorage sharedHTTPCookieStorage];
    return c;
  });
}
@end

package com.asdk.media.pouchstream;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;
import java.util.List;

public class NetworkUtils {

    /**
     * Resolves the primary local IPv4 address of the device (Wi-Fi, AP hotspot, or Ethernet).
     */
    public static String getLocalIpAddress(Context context) {
        try {
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            // First look for Wi-Fi (wlan) or hotspot (ap/rndis)
            for (NetworkInterface intf : interfaces) {
                if (intf.isLoopback() || !intf.isUp()) continue;
                String name = intf.getName().toLowerCase();
                if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("rndis") || name.startsWith("eth") || name.startsWith("tiwlan")) {
                    for (InetAddress addr : Collections.list(intf.getInetAddresses())) {
                        if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                            String host = addr.getHostAddress();
                            if (host != null && !host.startsWith("127.")) {
                                return host;
                            }
                        }
                    }
                }
            }

            // Fallback to any non-loopback IPv4
            for (NetworkInterface intf : interfaces) {
                if (intf.isLoopback() || !intf.isUp()) continue;
                for (InetAddress addr : Collections.list(intf.getInetAddresses())) {
                    if (!addr.isLoopbackAddress() && addr instanceof Inet4Address) {
                        String host = addr.getHostAddress();
                        if (host != null && !host.startsWith("127.")) {
                            return host;
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return "127.0.0.1";
    }

    public static boolean isConnectedToNetwork(Context context) {
        try {
            ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                NetworkCapabilities nc = cm.getNetworkCapabilities(cm.getActiveNetwork());
                if (nc != null) {
                    return nc.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                            || nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                            || nc.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET);
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }
}

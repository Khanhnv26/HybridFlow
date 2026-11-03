package com.hybridflow.connection.support;

import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;
import java.nio.charset.StandardCharsets;

@Component
public class GoogleTokenCipher {
    private final String configuredKey;
    public GoogleTokenCipher(@Value("${google.oauth.encryption-key:}") String key) { this.configuredKey = key; }

    public String encrypt(String value) {
        if (value == null) return null;
        try {
            byte[] nonce = new byte[12];
            new SecureRandom().nextBytes(nonce);
            Cipher cipher = cipher(Cipher.ENCRYPT_MODE, nonce);
            return Base64.getEncoder().encodeToString(nonce) + ":" +
                    Base64.getEncoder().encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Cấu hình GOOGLE_CREDENTIAL_ENCRYPTION_KEY bằng khóa Base64 32 byte để lưu kết nối Google.");
        }
    }

    public String decrypt(String value) {
        if (value == null) return null;
        try {
            String[] parts = value.split(":", 2);
            return new String(cipher(Cipher.DECRYPT_MODE, Base64.getDecoder().decode(parts[0]))
                    .doFinal(Base64.getDecoder().decode(parts[1])), StandardCharsets.UTF_8);
        } catch (Exception exception) {
            throw new IllegalStateException("Không thể giải mã kết nối Google. Kiểm tra khóa mã hóa của backend.");
        }
    }

    private Cipher cipher(int mode, byte[] nonce) throws Exception {
        byte[] key = Base64.getDecoder().decode(configuredKey);
        if (key.length != 32) throw new IllegalArgumentException();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
        return cipher;
    }
}

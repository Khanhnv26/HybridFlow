package com.hybridflow.auth.repository;

import com.hybridflow.auth.dto.response.MeResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
@RequiredArgsConstructor
public class AccountRepository {
    private final JdbcTemplate jdbcTemplate;

    public void upsertGoogle(String subject, String email, String name) {
        upsertGoogle(subject, email, name, null);
    }

    public void upsertGoogle(String subject, String email, String name, String avatarUrl) {
        jdbcTemplate.update("""
                INSERT INTO app_users(id, google_subject, email, display_name, avatar_url)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(google_subject) DO UPDATE
                SET email=EXCLUDED.email, display_name=EXCLUDED.display_name,
                    avatar_url=COALESCE(EXCLUDED.avatar_url, app_users.avatar_url),
                    updated_at=now()
                """, UUID.randomUUID(), subject, email, name, avatarUrl);
    }

    public Optional<MeResponse> findBySubject(String subject) {
        return jdbcTemplate.query("""
                SELECT id, email, display_name, avatar_url
                FROM app_users
                WHERE google_subject = ?
                """, (rs, rowNum) -> new MeResponse(
                        rs.getObject("id", UUID.class),
                        rs.getString("email"),
                        rs.getString("display_name"),
                        rs.getString("avatar_url")
                ), subject).stream().findFirst();
    }

}

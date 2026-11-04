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
        jdbcTemplate.update("""
                INSERT INTO app_users(id, google_subject, email, display_name)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(google_subject) DO UPDATE
                SET email=EXCLUDED.email, display_name=EXCLUDED.display_name,
                    updated_at=now()
                """, UUID.randomUUID(), subject, email, name);
    }

    public Optional<MeResponse> findBySubject(String subject) {
        return jdbcTemplate.query("""
                SELECT id, email, display_name
                FROM app_users
                WHERE google_subject = ?
                """, (rs, rowNum) -> new MeResponse(
                        rs.getObject("id", UUID.class),
                        rs.getString("email"),
                        rs.getString("display_name")
                ), subject).stream().findFirst();
    }

}

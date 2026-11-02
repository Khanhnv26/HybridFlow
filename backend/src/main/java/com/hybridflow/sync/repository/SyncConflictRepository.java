package com.hybridflow.sync.repository;

import com.hybridflow.sync.entity.SyncConflict;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

@Repository
public interface SyncConflictRepository extends JpaRepository<SyncConflict, Long> {

    List<SyncConflict> findByStatus(String status);
    List<SyncConflict> findByRecordId(String recordId);
    List<SyncConflict> findByFlowIdAndStatus(String flowId, String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from SyncConflict c where c.id = :id")
    Optional<SyncConflict> findLockedById(@Param("id") Long id);

    @Query("select c.flowId from SyncConflict c where c.id = :id")
    Optional<String> findFlowIdById(@Param("id") Long id);
}

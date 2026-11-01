package com.hybridflow.sync.repository;

import com.hybridflow.sync.entity.SyncConflict;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SyncConflictRepository extends JpaRepository<SyncConflict, Long> {

    List<SyncConflict> findByStatus(String status);
    List<SyncConflict> findByRecordId(String recordId);
}

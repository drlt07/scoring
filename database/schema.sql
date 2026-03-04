-- ============================================
-- FANROC 2026 – Database Schema
-- MySQL 5.7+
-- ============================================

CREATE DATABASE IF NOT EXISTS `fanroc_scoring`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `fanroc_scoring`;

-- Người dùng (Admin, Giám khảo)
CREATE TABLE IF NOT EXISTS `users` (
  `id`             VARCHAR(36)  PRIMARY KEY,
  `email`          VARCHAR(255) NOT NULL UNIQUE,
  `password`       VARCHAR(255) NOT NULL,
  `role`           ENUM('ADMIN','JUDGE') NOT NULL,
  `name`           VARCHAR(255) NOT NULL,
  `assigned_field` INT          DEFAULT NULL,
  `created_at`     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Đội thi
CREATE TABLE IF NOT EXISTS `teams` (
  `id`         VARCHAR(36)  PRIMARY KEY,
  `stt`        INT          NOT NULL,
  `code`       VARCHAR(50)  NOT NULL,
  `name`       VARCHAR(255) NOT NULL,
  `school`     VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trận đấu (score lưu dạng JSON)
CREATE TABLE IF NOT EXISTS `matches` (
  `id`            VARCHAR(36) PRIMARY KEY,
  `match_number`  INT         NOT NULL,
  `field`         INT         NOT NULL,
  `start_time`    VARCHAR(10) NOT NULL,
  `end_time`      VARCHAR(10) NOT NULL,
  `status`        ENUM('UPCOMING','SCORING','PENDING','LOCKED') DEFAULT 'UPCOMING',
  `alliance_red`  JSON        NOT NULL,
  `alliance_blue` JSON        NOT NULL,
  `created_at`    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tài khoản mặc định
INSERT IGNORE INTO `users` (`id`, `email`, `password`, `role`, `name`, `assigned_field`) VALUES
  ('admin_1', 'admin@fanroc.com',  'admin', 'ADMIN', 'Trưởng Ban Tổ Chức',  NULL),
  ('gk1',     'gk1@fanroc.com',    'gk1',   'JUDGE', 'Giám Khảo Sân 1',     1),
  ('gk2',     'gk2@fanroc.com',    'gk2',   'JUDGE', 'Giám Khảo Sân 2',     2),
  ('gk3',     'gk3@fanroc.com',    'gk3',   'JUDGE', 'Giám Khảo Sân 3',     3);

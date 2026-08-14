IF OBJECT_ID('dbo.Flights', 'U') IS NOT NULL DROP TABLE dbo.Flights;
IF OBJECT_ID('dbo.Aircraft', 'U') IS NOT NULL DROP TABLE dbo.Aircraft;
IF OBJECT_ID('dbo.Bases', 'U') IS NOT NULL DROP TABLE dbo.Bases;
GO

CREATE TABLE dbo.Bases (
  Id     INT IDENTITY(1,1) PRIMARY KEY,
  Nome   NVARCHAR(100) NOT NULL UNIQUE
);
GO

CREATE TABLE dbo.Aircraft (
  Id     INT IDENTITY(1,1) PRIMARY KEY,
  Tail   NVARCHAR(20)  NOT NULL UNIQUE,
  Model  NVARCHAR(50)  NOT NULL
);
GO

CREATE TABLE dbo.Flights (
  Id            NVARCHAR(50)   NOT NULL PRIMARY KEY,
  Base          NVARCHAR(100)  NOT NULL,
  Reg           NVARCHAR(20)   NOT NULL,
  FlightNo      NVARCHAR(20)   NOT NULL,
  Model         NVARCHAR(50)   NULL,
  Horario       NVARCHAR(10)   NULL,
  CP            NVARCHAR(100)  NULL,
  FO            NVARCHAR(100)  NULL,
  FA            NVARCHAR(100)  NULL,
  Cliente       NVARCHAR(100)  NULL,
  Unidade       NVARCHAR(100)  NULL,
  Destino       NVARCHAR(400)  NULL,
  Status        NVARCHAR(30)   NULL,
  CriadoEm      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
  AtualizadoEm  DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

CREATE INDEX IX_Flights_Base ON dbo.Flights(Base);
GO

INSERT INTO dbo.Bases (Nome) VALUES
 (N'Macaé'), (N'Cabo Frio'), (N'Farol de São Tomé'), (N'Jacarepaguá'), (N'Maricá');
GO

INSERT INTO dbo.Aircraft (Tail, Model) VALUES
 ('PS-VGM','Aeronave CHC'), ('PS-LRR','Aeronave CHC'),
 ('PR-BGU','AW139'),        ('PR-CGE','AW139'),
 ('PR-BGT','AW139'),        ('PR-CGW','Aeronave CHC'),
 ('PR-CGK','Aeronave CHC'), ('PR-CGD','Aeronave CHC'),
 ('PR-CGF','Aeronave CHC'), ('PR-CGS','Aeronave CHC'),
 ('PR-CGU','Aeronave CHC'), ('PS-CDR','Aeronave CHC'),
 ('PR-CGT','Aeronave CHC'), ('PR-BGZ','Aeronave CHC'),
 ('PR-CGP','AW139'),        ('PS-FCB','Aeronave CHC'),
 ('PS-CDT','Aeronave CHC'), ('PS-CPU','Aeronave CHC');
GO

INSERT INTO dbo.Flights (Id, Base, Reg, FlightNo, Model, Horario, CP, FO, FA, Cliente, Unidade, Destino, Status) VALUES
 ('fl_seed_0001', N'Macaé',      'PR-CGP', '0125', 'AW139', '10:15', 'J. Almeida', 'R. Santos', 'M. Costa', 'Petrobras', 'P-74',                     N'Macaé ➜ P-74 ➜ Macaé', 'EM VOO'),
 ('fl_seed_0002', N'Cabo Frio',  'PR-BGU', '0126', 'AW139', '10:30', 'F. Lima',    'C. Duarte', 'A. Rocha', 'Petrobras', 'FPSO Cidade de Angra',     N'Cabo Frio ➜ FPSO Cidade de Angra ➜ Cabo Frio', 'EM VOO');
GO

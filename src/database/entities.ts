import { Entity, PrimaryColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('processing_state')
export class ProcessingStateEntity {
  @PrimaryColumn()
    vprName!: string;

  @Column('int', { nullable: true })
    lastProcessedBlock!: number | null;

  @CreateDateColumn()
    createdAt!: Date;

  @UpdateDateColumn()
    updatedAt!: Date;
}

@Entity('reattemptable_resources')
export class ReattemptableResourceEntity {
  @PrimaryColumn()
    id: string;

  @Column()
    vprName: string;

  @Column()
    resourceType: 'dereference' | 'evaluation';

  @Column()
    firstFailureAt: Date;

  @Column()
    lastRetryAt: Date;

  @Column()
    errorType: string;

  @Column({ default: 0 })
    retryCount: number;

  @CreateDateColumn()
    createdAt: Date;

  @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('cached_objects')
export class CachedObjectEntity {
  @PrimaryColumn()
    url: string;

  @Column('jsonb')
    content: any;

  @Column()
    cachedAt: Date;

  @Column()
    expiresAt: Date;

  @Column({ nullable: true })
    contentHash: string;

  @CreateDateColumn()
    createdAt: Date;

  @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('trust_evaluations')
@Index(['did', 'vprName'])
export class TrustEvaluationEntity {
  @PrimaryColumn()
    id: string;

  @Column()
    did: string;

  @Column()
    vprName: string;

  @Column()
    verifiableTrustStatus: 'trusted' | 'partially_trusted' | 'untrusted';

  @Column()
    production: boolean;

  @Column('jsonb')
    validCredentials: any[];

  @Column('jsonb')
    ignoredCredentials: any[];

  @Column('jsonb')
    failedCredentials: any[];

  @Column()
    isVerifiableService: boolean;

  @Column('jsonb')
    ecosystems: string[];

  @Column('jsonb')
    roles: string[];

  @Column()
    evaluatedAt: Date;

  @Column()
    expiresAt: Date;

  @Column({ nullable: true })
    blockHeight: number;

  @CreateDateColumn()
    createdAt: Date;

  @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('services')
@Index(['did', 'vprName'])
export class ServiceEntity {
  @PrimaryColumn()
    did: string;

  @Column()
    vprName: string;

  @Column({ nullable: true })
    displayName: string;

  @Column('jsonb', { nullable: true })
    metadata: any;

  @Column({ nullable: true })
    location: string;

  @Column('jsonb', { nullable: true })
    serviceTypes: string[];

  @Column('jsonb', { nullable: true })
    linkedEcosystems: string[];

  @Column({ nullable: true })
    trustStatus: 'trusted' | 'partially_trusted' | 'untrusted';

  @Column({ nullable: true })
    blockHeight: number;

  @CreateDateColumn()
    createdAt: Date;

  @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('ecosystems')
@Index(['did', 'vprName'])
export class EcosystemEntity {
  @PrimaryColumn()
    did: string;

  @Column()
    vprName: string;

  @Column({ nullable: true })
    trustRegistryDid: string;

  @Column({ nullable: true })
    displayName: string;

  @Column('jsonb', { nullable: true })
    governanceFramework: any;

  @Column('jsonb', { nullable: true })
    deposits: any;

  @Column({ nullable: true })
    blockHeight: number;

  @CreateDateColumn()
    createdAt: Date;

  @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('credentials')
@Index(['id', 'vprName'])
export class CredentialEntity {
  @PrimaryColumn()
    id: string;

  @Column()
    vprName: string;

  @Column()
    schemaId: string;

  @Column()
    issuerDid: string;

  @Column()
    subjectDid: string;

  @Column('jsonb')
    claims: any;

  @Column({ nullable: true })
    issuanceBlockHeight: number;

  @Column()
    valid: boolean;

  @Column({ nullable: true })
    expirationDate: Date;

  @Column({ nullable: true })
    blockHeight: number;

  @CreateDateColumn()
    createdAt: Date;

  @UpdateDateColumn()
    updatedAt: Date;
}

@Entity('permissions')
@Index(['id', 'vprName'])
export class PermissionEntity {
  @PrimaryColumn()
    id: string;

  @Column()
    vprName: string;

  @Column()
    grantorDid: string;

  @Column()
    granteeDid: string;

  @Column()
    permissionType: string;

  @Column('jsonb', { nullable: true })
    constraints: any;

  @Column()
    active: boolean;

  @Column({ nullable: true })
    validFrom: Date;

  @Column({ nullable: true })
    validUntil: Date;

  @Column({ nullable: true })
    blockHeight: number;

  @CreateDateColumn()
    createdAt: Date;

  @UpdateDateColumn()
    updatedAt: Date;
}

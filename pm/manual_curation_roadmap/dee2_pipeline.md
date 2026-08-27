# Software assay description for Digital Expression Explorer pipeline

GitHub: https://github.com/markziemann/dee2
Docker Image: https://hub.docker.com/r/mziemann/tallyup

This protocol description should eventually lead up to an actual runnable workflow in ARCs, but for now a software assay suffices for provenance tracking.

Adapted from https://dee2.io/pipeline on 2026-06-05

## Overview

The DEE2 pipeline is written in bash and uses open-source tools in a Docker container to analyse, filter and process the data. Our data processing procedure entails (1) Download from NCBI SRA; (2) Diagnose sequence format; (3) Sequence quality trimming and adapter clipping, (4), Alignment to genome and transcriptome and (5) Assignment of reads to genes and transcripts. The Docker image is available from Docker Hub. More information regarding the data processing method is available at the GitHub repo and at the original publication. Below are the versions and major parameters used in the pipeline.

## Software versions

Software versions and parameters used in the pipeline.

| Software, version | Purpose | Parameter (SE) | Parameter (PE) |
| --- | --- | --- | --- |
| Aspera client, v3.5.4 | Rapid download of sequence data | `ascp -l 500m -O 33001 -T -i $ID $URL .` | |
| SRA toolkit, v2.8.2 | Validate downloaded SRA files | `vdb-validate $SRA` | |
| | Diagnose single or paired end | `fastq-dump -X 4000 --split-files $SRA` | |
| | Dump fastq | (see parallel-fastq-dump below) | |
| FastQC, v0.11.5 | Diagnose basespace / colorspace, quality encoding, read length from 4000 reads | `fastqc $FQ1` | `fastqc $FQ2` |
| parallel-fastq-dump, 0.6.3 | Rapid decompression of sequence data from .sra files | | `parallel-fastq-dump --threads $THREADS --outdir . --split-files --defline-qual + -s ${SRR}.sra` |
| Skewer, v0.2.2 | 3' quality trimming | `skewer -l 18 -q 10 -k inf -t $THREADS -o $SRR $FQ1` | `skewer -l 18 -q 10 -k inf -t $THREADS -o $SRR $FQ1 $FQ2` |
| | Adapter clipping | `skewer -l 18 -t $THREADS -x $ADAPTER -o $SRR $FQ1` | `skewer -l 18 -t $THREADS -x $ADAPTER1 -y $ADAPTER2 -o $SRR $FQ1 $FQ2` |
| | 5' trimming | `skewer -m ap --cut $CLIP_NUM,$CLIP_NUM -l 18 -k inf -t $THREADS $FQ1` | `skewer -m ap --cut $R1_CLIP_NUM,$R2_CLIP_NUM -l 18 -k inf -t $THREADS $FQ1 $FQ2` |
| Minion, v13-100 | 3' adapter detection | `minion search-adapter -i $FQ1` | `minion search-adapter -i $FQ2` |
| Bowtie2, v2.3.2 | Adapter contamination detection | `bowtie2 -f -x $BT2_REF -S /dev/stdout $ADAPTER` | |
| FASTX-Toolkit, v0.0.14 | Progressive 5' trimming | `fastx_trimmer -f {5,9,13,21} -m 18 -Q 33 -i $FQ1` | `fastx_trimmer -f {5,9,13,21} -m 18 -Q 33 -i $FQ2` |
| STAR v020201 | Gene-level mapping, Diagnose strandedness | `STAR --runThreadN $THREADS --quantMode GeneCounts --genomeLoad LoadAndKeep --outSAMtype None --genomeDir $STAR_DIR --readFilesIn=$FQ1` | `STAR --runThreadN $THREADS --quantMode GeneCounts --genomeLoad LoadAndKeep --outSAMtype None --genomeDir $STAR_DIR --readFilesIn=$FQ1 $FQ2` |
| Kallisto, v0.43.1 | Transcript-level mapping | `kallisto quant $KALLISTO_STRAND_PARAMETER --single -l 100 -s 20 -t $THREADS -o . -i $KAL_REF $FQ1` | `kallisto quant $KALLISTO_STRAND_PARAMETER -t $THREADS -o . -i $KAL_REF $FQ1 $FQ2` |

## Reference genome information

The compendium relies on reference genome sequence and annotation information provided by Ensembl Genomes.

| Species | Genome Reference Sequence and Annotation |
| --- | --- |
| *Arabidopsis thaliana* | Ensembl Plants release 36<br>[Genome sequence (fasta)](ftp://ftp.ensemblgenomes.org/pub/release-36/plants/fasta/arabidopsis_thaliana/dna/Arabidopsis_thaliana.TAIR10.dna_sm.toplevel.fa.gz)<br>[Gene annotation set (GTF)](ftp://ftp.ensemblgenomes.org/pub/release-36/plants/gtf/arabidopsis_thaliana/Arabidopsis_thaliana.TAIR10.36.gtf.gz)<br>[cDNA sequences (fasta)](ftp://ftp.ensemblgenomes.org/pub/release-36/plants/fasta/arabidopsis_thaliana/cdna/Arabidopsis_thaliana.TAIR10.cdna.all.fa.gz) |
| *Caenorhabditis elegans* | Ensembl release 90<br>[Genome sequence (fasta)](ftp://ftp.ensemblorg.ebi.ac.uk/pub/release-90/fasta/caenorhabditis_elegans/dna/Caenorhabditis_elegans.WBcel235.dna_sm.toplevel.fa.gz)<br>[Gene annotation set (GTF)](ftp://ftp.ensembl.org/pub/release-90/gtf/caenorhabditis_elegans/Caenorhabditis_elegans.WBcel235.90.gtf.gz)<br>[cDNA sequences (fasta)](ftp://ftp.ensembl.org/pub/release-90/fasta/caenorhabditis_elegans/cdna/Caenorhabditis_elegans.WBcel235.cdna.all.fa.gz) |
| *Drosophila melanogaster* | Ensembl release 90<br>[Genome sequence (fasta)](ftp://ftp.ensemblorg.ebi.ac.uk/pub/release-90/fasta/drosophila_melanogaster/dna/Drosophila_melanogaster.BDGP6.dna_sm.toplevel.fa.gz)<br>[Gene annotation set (GTF)](ftp://ftp.ensembl.org/pub/release-90/gtf/drosophila_melanogaster/Drosophila_melanogaster.BDGP6.90.gtf.gz)<br>[cDNA sequences (fasta)](ftp://ftp.ensembl.org/pub/release-90/fasta/drosophila_melanogaster/cdna/Drosophila_melanogaster.BDGP6.cdna.all.fa.gz) |
| *Danio rerio* | Ensembl release 90<br>[Genome sequence (fasta)](ftp://ftp.ensemblorg.ebi.ac.uk/pub/release-90/fasta/danio_rerio/dna/Danio_rerio.GRCz10.dna_sm.toplevel.fa.gz)<br>[Gene annotation set (GTF)](ftp://ftp.ensembl.org/pub/release-90/gtf/danio_rerio/Danio_rerio.GRCz10.90.gtf.gz)<br>[cDNA sequences (fasta)](ftp://ftp.ensemblorg.ebi.ac.uk/pub/release-90/fasta/danio_rerio/cdna/Danio_rerio.GRCz10.cdna.all.fa.gz) |
| *Escherichia coli* | Ensembl release 36<br>[Genome sequence (fasta)](ftp://ftp.ensemblgenomes.org/pub/bacteria/release-36/fasta/bacteria_0_collection/escherichia_coli_str_k_12_substr_mg1655/dna/Escherichia_coli_str_k_12_substr_mg1655.ASM584v2.dna_sm.toplevel.fa.gz)<br>[Gene annotation set (GTF)](ftp://ftp.ensemblgenomes.org/pub/bacteria/release-36/gtf/bacteria_0_collection/escherichia_coli_str_k_12_substr_mg1655/Escherichia_coli_str_k_12_substr_mg1655.ASM584v2.36.gtf.gz)<br>[cDNA sequences (fasta)](ftp://ftp.ensemblgenomes.org/pub/bacteria/release-36/fasta/bacteria_0_collection/escherichia_coli_str_k_12_substr_mg1655/cdna/Escherichia_coli_str_k_12_substr_mg1655.ASM584v2.cdna.all.fa.gz) |
| *Homo sapiens* | Ensembl release 90<br>[Genome sequence (fasta)](ftp://ftp.ensemblorg.ebi.ac.uk/pub/release-90/fasta/homo_sapiens/dna/Homo_sapiens.GRCh38.dna_sm.primary_assembly.fa.gz)<br>[Gene annotation set (GTF)](ftp://ftp.ensembl.org/pub/release-90/gtf/homo_sapiens/Homo_sapiens.GRCh38.90.gtf.gz)<br>[cDNA sequences (fasta)](ftp://ftp.ensembl.org/pub/release-90/fasta/homo_sapiens/cdna/Homo_sapiens.GRCh38.cdna.all.fa.gz) |
| *Mus musculus* | Ensembl release 90<br>[Genome sequence (fasta)](ftp://ftp.ensemblorg.ebi.ac.uk/pub/release-90/fasta/mus_musculus/dna/Mus_musculus.GRCm38.dna_sm.primary_assembly.fa.gz)<br>[Gene annotation set (GTF)](ftp://ftp.ensembl.org/pub/release-90/gtf/mus_musculus/Mus_musculus.GRCm38.90.gtf.gz)<br>[cDNA sequences (fasta)](ftp://ftp.ensembl.org/pub/release-90/fasta/mus_musculus/cdna/Mus_musculus.GRCm38.cdna.all.fa.gz) |
| *Oryza sativa* | Ensembl Plants release 59<br>[Genome sequence (fasta)](ftp://ftp.ensemblgenomes.ebi.ac.uk/pub/plants/release-59/fasta/oryza_sativa/dna/Oryza_sativa.IRGSP-1.0.dna_sm.toplevel.fa.gz)<br>[Gene annotation set (GTF)](ftp://ftp.ensemblgenomes.ebi.ac.uk/pub/plants/release-59/gtf/oryza_sativa/Oryza_sativa.IRGSP-1.0.59.gtf.gz)<br>[cDNA sequences (fasta)](ftp://ftp.ensemblgenomes.ebi.ac.uk/pub/plants/release-59/fasta/oryza_sativa/cdna/Oryza_sativa.IRGSP-1.0.cdna.all.fa.gz) |
| *Rattus norvegicus* | Ensembl release 90<br>[Genome sequence (fasta)](ftp://ftp.ensemblorg.ebi.ac.uk/pub/release-90/fasta/rattus_norvegicus/dna/Rattus_norvegicus.Rnor_6.0.dna_sm.toplevel.fa.gz)<br>[Gene annotation set (GTF)](ftp://ftp.ensembl.org/pub/release-90/gtf/rattus_norvegicus/Rattus_norvegicus.Rnor_6.0.90.gtf.gz)<br>[cDNA sequences (fasta)](ftp://ftp.ensembl.org/pub/release-90/fasta/rattus_norvegicus/cdna/Rattus_norvegicus.Rnor_6.0.cdna.all.fa.gz) |
| *Saccharomyces cerevisiae* | Ensembl release 36<br>[Genome sequence (fasta)](ftp://ftp.ensemblgenomes.org/pub/fungi/release-36/fasta/saccharomyces_cerevisiae/dna/Saccharomyces_cerevisiae.R64-1-1.dna_sm.toplevel.fa.gz)<br>[Gene annotation set (GTF)](ftp://ftp.ensemblgenomes.org/pub/release-36/fungi/gtf/saccharomyces_cerevisiae/Saccharomyces_cerevisiae.R64-1-1.36.gtf.gz)<br>[cDNA sequences (fasta)](ftp://ftp.ensemblgenomes.org/pub/release-36/fungi/fasta/saccharomyces_cerevisiae/cdna/Saccharomyces_cerevisiae.R64-1-1.cdna.all.fa.gz) |
| *Zea mays* | Ensembl Plants release 59<br>[Genome sequence (fasta)](https://ftp.ebi.ac.uk/ensemblgenomes/pub/release-59/plants/fasta/zea_mays/dna/Zea_mays.Zm-B73-REFERENCE-NAM-5.0.dna_sm.toplevel.fa.gz)<br>[Gene annotation set (GTF)](https://ftp.ebi.ac.uk/ensemblgenomes/pub/release-59/plants/gtf/zea_mays/Zea_mays.Zm-B73-REFERENCE-NAM-5.0.59.gtf.gz)<br>[cDNA sequences (fasta)](https://ftp.ebi.ac.uk/ensemblgenomes/pub/release-59/plants/fasta/zea_mays/cdna/Zea_mays.Zm-B73-REFERENCE-NAM-5.0.cdna.all.fa.gz) |

## Understanding quality metrics

The philosophy behind DEE2 is that we will process and provide as much of the data available on SRA as possible with minimal filtering. We provide detailed quality metrics for each run so that users can perform their own filtering procedures. A description of each of the quality metrics is provided on the Gitub page here. 

## Update cycle

The data repository is updated on an irregular basis, depending on available compute resources and time. 